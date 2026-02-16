import time
import uuid
import httpx
from urllib.parse import unquote_plus, parse_qs
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import PlainTextResponse

from app.waf.engine import WAFEngine
from app.waf.decisions import Action
from app.proxy.normalization import NormalizedRequest, safe_unquote, normalize_path, normalize_body_text
from app.waf.ai_features import extract_features
from app.waf.ai_dataset import append_request_row as append_baseline
from app.ai_models.retrain_manager import increment_baseline_counter, trigger_retrain_async

router = APIRouter()
waf = WAFEngine()
AI_LOG_THRESHOLD = 0.90

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

def extract_body_keys(body_text: str, content_type: str) -> list:
    """
    Extract only parameter keys from request body.
    No values are returned.
    """
    if not body_text:
        return []

    content_type = (content_type or "").lower()

    try:
        # JSON
        if "application/json" in content_type:
            data = json.loads(body_text)
            if isinstance(data, dict):
                return list(data.keys())
            return []

        # Form-urlencoded
        if "application/x-www-form-urlencoded" in content_type:
            parsed = parse_qs(body_text, keep_blank_values=True)
            return list(parsed.keys())

        # Basic XML tag extraction
        if "xml" in content_type:
            return list(set(re.findall(r"<([a-zA-Z0-9_:-]+)", body_text)))

    except Exception:
        return []

    return []

async def _process_ai_analysis(request: Request, req_norm: NormalizedRequest, decision, waf_mode: str):
    """
    Handles AI feature extraction, anomaly scoring, and baseline collection.
    Updates the decision object in-place if an anomaly is detected.
    """
    anomaly_ai = getattr(request.app.state, "anomaly_ai_scorer", None)
    results = {
        "score": None,
        "flagged": False,
        "baseline_written": False,
        "model_ready": False
    }

    # 1. Feature Extraction
    try:
        features = extract_features(
            method=req_norm.method,
            raw_path=req_norm.raw_target_wire.split('?')[0], # Simplified from handle_all logic
            decoded_path=req_norm.decoded_path,
            normalized_path=req_norm.normalized_path,
            raw_query=request.scope.get("query_string", b"").decode("utf-8", errors="ignore"),
            headers=req_norm.headers,
            body_len=req_norm.body_len,
            body_text=req_norm.body_text,
        )
    except Exception as e:
        print(f"[AI] Feature extraction failed: {e}")
        return results

    # 2. Scoring
    results["model_ready"] = bool(anomaly_ai and hasattr(anomaly_ai, "is_ready") and anomaly_ai.is_ready())
    
    if results["model_ready"]:
        try:
            score = anomaly_ai.score(features)
            results["score"] = score
            
            if score >= AI_LOG_THRESHOLD:
                results["flagged"] = True
                decision.reasons = list(decision.reasons or [])
                decision.reasons.append(f"AI_ANOMALY:{score:.3f}")
        except Exception as e:
            print(f"[AI] Scoring failed: {e}")
    else :
        # train classifier ai
        print("Add train classifier ai code")

    # 3. Baseline Collection (Only for clean, non-anomalous traffic)
    if decision.action == Action.ALLOW and not results["flagged"]:
        try:
            append_baseline(features)
            results["baseline_written"] = True
            increment_baseline_counter(1)
            trigger_retrain_async(request.app)
        except Exception as e:
            print(f"[AI] Baseline update failed: {e}")

    return results

def _log_waf_event(request: Request, req_norm: NormalizedRequest, decision, ai_results, 
                   request_id, start_time, waf_mode, protected_target, 
                   upstream_info=None):
    """
    Centralized logging for all WAF outcomes (Allow, Block, Rate Limit).
    """
    latency_ms = int((time.perf_counter() - start_time) * 1000)
    
    body_keys = extract_body_keys(
        req_norm.body_text,
        request.headers.get("content-type", "")
    )

    log_data = {
        "request_id": request_id,
        "mode": waf_mode,
        "client_ip": req_norm.client_ip,
        "user_agent": req_norm.user_agent,
        "method": req_norm.method,
        "destination": {"target": protected_target},
        "raw_target_wire": req_norm.raw_target_wire,
        "decoded_path": req_norm.decoded_path,
        "normalized_path": req_norm.normalized_path,
        "query": req_norm.query,
        "body_len": req_norm.body_len,
        "body_keys": body_keys, 
        "decision": {
            "action": decision.action,
            "reasons": decision.reasons,
            "status_code": decision.status_code or (429 if decision.action == Action.RATE_LIMIT else 403),
        },
        "ai": ai_results,
        "latency_ms": latency_ms,
    }

    if upstream_info:
        log_data["upstream"] = upstream_info

    request.app.state.logging_service.log_event(log_data)

@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def handle_all(request: Request, path: str):
    request_id = str(uuid.uuid4())
    start = time.perf_counter()
    
    # 1. Configuration Check
    waf_mode = _get_waf_mode(request)
    if not waf_mode:
        return PlainTextResponse("WAF is not configured.", status_code=503)
    
    # 2. Extract Target Info (For Logging)
    cfg = getattr(request.app.state, "waf_config", {})
    target_host = cfg.get("target_host") or cfg.get("protected_host") or cfg.get("ip")
    target_port = cfg.get("target_port") or cfg.get("port")
    protected_target = f"{target_host}:{target_port}" if target_host and target_port else str(target_host or "")

    # 3. Request Normalization
    # Note: This logic is essential so req_norm exists for the AI and Logging helpers
    raw_path_bytes = request.scope.get("raw_path", b"")
    raw_path_wire = raw_path_bytes.decode("utf-8", errors="surrogateescape")
    raw_query = request.scope.get("query_string", b"").decode("utf-8", errors="surrogateescape")
    
    # Prepare Body
    body_text = ""
    body_len = 0
    if request.method in ("POST", "PUT", "PATCH"):
        try:
            body_full = await request.body()
            request.state.cached_body = body_full
            body_len = len(body_full)
            if request.headers.get("content-type", "").lower().startswith(("application/json", "application/x-www-form-urlencoded", "application/xml", "text/")):
                body_text = normalize_body_text(body_full.decode("utf-8", errors="ignore"))
        except Exception:
            request.state.cached_body = b""

    req_norm = NormalizedRequest(
        method=request.method,
        raw_target_wire=raw_path_wire + (("?" + raw_query) if raw_query else ""),
        decoded_path=safe_unquote(raw_path_wire),
        normalized_path=normalize_path(safe_unquote(raw_path_wire)),
        query=unquote_plus(raw_query),
        headers=dict(request.headers),
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        body_len=body_len,
        body_text=body_text
    )

    # 4. Decision & AI Analysis
    decision = waf.evaluate(req_norm)
    ai_results = await _process_ai_analysis(request, req_norm, decision, waf_mode)

    effective_action = decision.action
    if waf_mode == "shadow" and effective_action != Action.ALLOW:
        effective_action = Action.ALLOW

    # 5. Action Execution
    if effective_action == Action.BLOCK:
        _log_waf_event(request, req_norm, decision, ai_results, request_id, start, waf_mode, protected_target)
        return PlainTextResponse("Blocked by WAF", status_code=decision.status_code or 403)

    if effective_action == Action.RATE_LIMIT:
        _log_waf_event(request, req_norm, decision, ai_results, request_id, start, waf_mode, protected_target)
        return PlainTextResponse("Too Many Requests", status_code=429)

    # 6. Proxy Forwarding
    proxy = request.app.state.proxy_service
    upstream_data = {"status_code": None, "error": None}
    
    try:
        resp = await proxy.forward(request)
        upstream_data["status_code"] = resp.status_code
        return resp
    except httpx.RequestError as e:
        upstream_data["error"] = f"{type(e).__name__}: {e}"
        return PlainTextResponse("Upstream error", status_code=502)
    finally:
        # This covers the "ALLOW" (Success) and "SHADOW" (Allowed despite threat) cases
        _log_waf_event(request, req_norm, decision, ai_results, request_id, start, 
                       waf_mode, protected_target, upstream_info=upstream_data)