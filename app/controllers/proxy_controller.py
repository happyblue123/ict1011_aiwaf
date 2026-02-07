import time
import uuid
import httpx
from urllib.parse import unquote_plus
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import PlainTextResponse

from app.waf.engine import WAFEngine
from app.waf.decisions import Action
from app.proxy.normalization import NormalizedRequest, safe_unquote, normalize_path, normalize_body_text
from app.waf.ai_features import extract_features
from app.waf.ai_dataset import append_request_row as append_baseline

router = APIRouter()
waf = WAFEngine()


def _get_waf_mode(request: Request) -> str:
    """
    Read waf_mode from DB-backed runtime config stored in app.state.
    Returns: "shadow" or "protect" (defaults to protect)
    """
    cfg = getattr(request.app.state, "waf_config", None)
    if not cfg:
        return ""  # indicate not configured
    mode = (cfg.get("waf_mode") or "protect").strip().lower()
    if mode not in ("shadow", "protect"):
        mode = "protect"
    return mode


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def handle_all(request: Request, path: str):
    request_id = str(uuid.uuid4())
    start = time.perf_counter()

    # ✅ require config before proxying traffic
    waf_mode = _get_waf_mode(request)
    if not waf_mode:
        return PlainTextResponse(
            "WAF is not configured yet. Please complete setup.",
            status_code=503,
        )

     # ✅ capture protected target for logging (real destination)
    cfg = getattr(request.app.state, "waf_config", None) or {}

    target_host = (
        cfg.get("target_host")
        or cfg.get("app_host")
        or cfg.get("protected_host")
        or cfg.get("ip_address")
        or cfg.get("ip")
    )

    target_port = (
        cfg.get("target_port")
        or cfg.get("app_port")
        or cfg.get("protected_port")
        or cfg.get("port")
    )

    protected_target = ""
    if target_host and target_port:
        protected_target = f"{target_host}:{target_port}"
    elif target_host:
        protected_target = str(target_host)

    # ===== RAW PATH (ASGI, untouched) =====
    raw_path_bytes = request.scope.get("raw_path", b"")
    raw_path_wire = raw_path_bytes.decode("utf-8", errors="surrogateescape")

    # ===== DECODE + NORMALIZE PATH =====
    decoded_path = safe_unquote(raw_path_wire)
    normalized_path = normalize_path(decoded_path)

    # ===== QUERY =====
    raw_query = request.scope.get("query_string", b"").decode("utf-8", errors="surrogateescape")
    decoded_query = unquote_plus(raw_query)

    # ===== BODY SIZE (header) =====
    content_length = request.headers.get("content-length")
    body_len = int(content_length) if content_length and content_length.isdigit() else 0

    # ===== BODY (read once, cache full for forwarding, sample for features) =====
    body_text = ""

    if request.method in ("POST", "PUT", "PATCH"):
        try:
            body_full = await request.body()               # FULL body (bytes)
            request.state.cached_body = body_full          # used by proxy.forward()
            body_len = len(body_full)                      # authoritative size

            content_type = request.headers.get("content-type", "").lower()
            if content_type.startswith((
                "application/json",
                "application/x-www-form-urlencoded",
                "text/",
                "application/xml",
            )):
                body_text = body_full.decode("utf-8", errors="ignore")
                body_text = normalize_body_text(body_text)
            else:
                body_text = ""
        except Exception:
            request.state.cached_body = b""
            body_text = ""

    # ===== BUILD NORMALIZED REQUEST =====
    req_norm = NormalizedRequest(
        method=request.method,
        raw_target_wire=raw_path_wire + (("?" + raw_query) if raw_query else ""),
        decoded_path=decoded_path,
        normalized_path=normalized_path,
        query=decoded_query,
        headers=dict(request.headers),
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        body_len=body_len,
        body_text=body_text
    )

    logger = request.app.state.logging_service

    # ===== WAF DECISION/POLICY DECISION =====
    decision = waf.evaluate(req_norm)
    effective_action = decision.action

    # ✅ Shadow mode: allow everything (but still log reasons)
    if waf_mode == "shadow" and effective_action != Action.ALLOW:
        effective_action = Action.ALLOW

    # ===== AI: baseline collection + scoring =====
    anomaly_ai = getattr(request.app.state, "anomaly_ai_scorer", None)
    anomaly_score = None
    anomaly_flagged = False
    anomaly_baseline_written = False

    features = None
    try:
        features = extract_features(
            method=req_norm.method,
            raw_path=raw_path_wire,
            decoded_path=req_norm.decoded_path,
            normalized_path=req_norm.normalized_path,
            raw_query=raw_query,
            headers=req_norm.headers,
            body_len=req_norm.body_len,
            body_text=body_text,
        )
    except Exception:
        features = None

    # Only score if a trained model is loaded
    if anomaly_ai and hasattr(anomaly_ai, "is_ready") and anomaly_ai.is_ready() and features is not None:
        try:
            anomaly_score = anomaly_ai.score(features)
            AI_LOG_THRESHOLD = 0.90
            anomaly_flagged = anomaly_score >= AI_LOG_THRESHOLD

            if anomaly_flagged:
                decision.reasons = list(decision.reasons or [])
                decision.reasons.append(f"AI_ANOMALY:{anomaly_score:.3f}")

        except Exception:
            anomaly_score = None
            anomaly_flagged = False

    # Baseline collection (only if we actually have features)
    if features is not None and (decision.action == Action.ALLOW) and not anomaly_flagged:
        try:
            append_baseline(features)
            anomaly_baseline_written = True
        except Exception:
            anomaly_baseline_written = False

    # ===== BLOCK =====
    if effective_action == Action.BLOCK:
        latency_ms = int((time.perf_counter() - start) * 1000)
        logger.log_event({
            "request_id": request_id,
            "mode": waf_mode,
            "client_ip": req_norm.client_ip,
            "user_agent": req_norm.user_agent,
            "method": req_norm.method,
            "destination": {
                "target": protected_target,   # e.g. "127.0.0.1:5000"
            },
            "raw_target_wire": req_norm.raw_target_wire,
            "decoded_path": req_norm.decoded_path,
            "normalized_path": req_norm.normalized_path,
            "query": req_norm.query,
            "body_len": req_norm.body_len,
            "decision": {
                "action": decision.action,
                "reasons": decision.reasons,
                "status_code": decision.status_code,
            },
            "ai": {
                "model_ready": bool(anomaly_ai and hasattr(anomaly_ai, "is_ready") and anomaly_ai.is_ready()),
                "score": anomaly_score,
                "flagged": anomaly_flagged,
                "baseline_written": anomaly_baseline_written,
            },
            "latency_ms": latency_ms,
        })
        return PlainTextResponse("Blocked by WAF", status_code=decision.status_code or 403)

    # ===== RATE LIMIT =====
    if effective_action == Action.RATE_LIMIT:
        latency_ms = int((time.perf_counter() - start) * 1000)
        logger.log_event({
            "request_id": request_id,
            "mode": waf_mode,
            "client_ip": req_norm.client_ip,
            "user_agent": req_norm.user_agent,
            "method": req_norm.method,
            "destination": {
                "target": protected_target,   # e.g. "127.0.0.1:5000"
            },
            "raw_target_wire": req_norm.raw_target_wire,
            "decision": {
                "action": decision.action,
                "reasons": decision.reasons,
                "status_code": 429,
            },
            "ai": {
                "model_ready": bool(anomaly_ai and hasattr(anomaly_ai, "is_ready") and anomaly_ai.is_ready()),
                "score": anomaly_score,
                "flagged": anomaly_flagged,
                "baseline_written": anomaly_baseline_written,
            },
            "latency_ms": latency_ms,
        })
        return PlainTextResponse("Too Many Requests", status_code=429)

    # ===== FORWARD =====
    proxy = request.app.state.proxy_service
    upstream_status = None
    error = None

    try:
        resp = await proxy.forward(request)
        upstream_status = resp.status_code
        return resp

    except httpx.RequestError as e:
        error = f"{type(e).__name__}: {e}"
        return PlainTextResponse("Upstream error", status_code=502)

    finally:
        latency_ms = int((time.perf_counter() - start) * 1000)
        logger.log_event({
            "request_id": request_id,
            "mode": waf_mode,
            "client_ip": req_norm.client_ip,
            "user_agent": req_norm.user_agent,
            "method": req_norm.method,
            "destination": {
                "target": protected_target,   # e.g. "127.0.0.1:5000"
            },
            "raw_target_wire": req_norm.raw_target_wire,
            "decision": {
                "action": decision.action,
                "effective_action": effective_action,
                "reasons": decision.reasons,
                "status_code": decision.status_code,
            },
            "upstream": {
                "status_code": upstream_status,
                "error": error,
            },
            "ai": {
                "model_ready": bool(anomaly_ai and hasattr(anomaly_ai, "is_ready") and anomaly_ai.is_ready()),
                "score": anomaly_score,
                "flagged": anomaly_flagged,
                "baseline_written": anomaly_baseline_written,
            },
            "latency_ms": latency_ms,
        })
