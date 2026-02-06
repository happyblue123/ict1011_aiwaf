from __future__ import annotations
import httpx
from fastapi import Request, Response, HTTPException

from app.settings import derive_origin_base_url

HOP_BY_HOP_HEADERS = {
    "host",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}


class ProxyService:
    def __init__(self) -> None:
        self.client: httpx.AsyncClient | None = None

    async def startup(self) -> None:
        timeout = httpx.Timeout(connect=5.0, read=60.0, write=60.0, pool=30.0)
        limits = httpx.Limits(max_keepalive_connections=50, max_connections=200)
        self.client = httpx.AsyncClient(
            timeout=timeout,
            limits=limits,
            follow_redirects=False,
        )

    async def shutdown(self) -> None:
        if self.client is not None:
            await self.client.aclose()

    async def forward(self, request: Request) -> Response:
        if self.client is None:
            raise RuntimeError("ProxyService not started")

        # ✅ Load active waf config from app.state (set in main.py startup + refreshed after setup)
        cfg = getattr(request.app.state, "waf_config", None)
        if not cfg:
            raise HTTPException(
                status_code=503,
                detail="WAF is not configured yet. Please complete setup."
            )

        target_host = (cfg.get("target_host") or "").strip()   # "host:port"
        waf_mode = (cfg.get("waf_mode") or "protect").strip().lower()

        if ":" not in target_host:
            raise HTTPException(
                status_code=500,
                detail="Invalid WAF configuration in database (target_host missing/invalid)."
            )

        if waf_mode not in ("shadow", "protect"):
            waf_mode = "protect"  # safe default

        origin_base_url = derive_origin_base_url(target_host)

        raw_path = request.scope.get("raw_path", b"").decode("utf-8", errors="surrogateescape")
        raw_query = request.scope.get("query_string", b"").decode("utf-8", errors="surrogateescape")
        raw_target_wire = raw_path + (("?" + raw_query) if raw_query else "")

        # Copy headers but remove hop-by-hop headers
        headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP_HEADERS}

        # ✅ IMPORTANT: remove these so httpx sets them correctly
        headers.pop("content-length", None)
        headers.pop("transfer-encoding", None)
        headers.pop("accept-encoding", None)

        # If body was already read by WAF/controller, forward that exact bytes
        cached = getattr(request.state, "cached_body", None)
        if cached is not None:
            content = cached
        else:
            async def body_stream():
                async for chunk in request.stream():
                    yield chunk
            content = body_stream()

        # ✅ derive upstream_url from DB-backed config
        upstream_url = origin_base_url.rstrip("/") + raw_target_wire

        async with self.client.stream(
            method=request.method,
            url=upstream_url,
            headers=headers,
            content=content,
        ) as upstream_resp:
            resp_headers = {k: v for k, v in upstream_resp.headers.items() if k.lower() not in HOP_BY_HOP_HEADERS}
            resp_content = await upstream_resp.aread()

            # ✅ don't forward these; Starlette will set correct Content-Length
            resp_headers.pop("content-length", None)
            resp_headers.pop("transfer-encoding", None)

            # ✅ httpx may have decompressed the body; don't lie to the client
            resp_headers.pop("content-encoding", None)

            return Response(
                content=resp_content,
                status_code=upstream_resp.status_code,
                headers=resp_headers,
                media_type=upstream_resp.headers.get("content-type"),
            )
