# app/controllers/waf_controller.py
from __future__ import annotations

import json
from urllib.parse import urlparse

from fastapi import HTTPException
from app.db.db_config import get_conn
from app.models.user_model import UserModel


def _normalize_target(target_host: str) -> tuple[str, int]:
    raw = (target_host or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="target_host is required")

    if raw.startswith(("http://", "https://")):
        p = urlparse(raw)
        if not p.hostname:
            raise HTTPException(status_code=400, detail="Invalid target_host URL")
        port = p.port or (443 if p.scheme == "https" else 80)
        return p.hostname, int(port)

    if ":" in raw:
        host_part, port_str = raw.rsplit(":", 1)
        if not port_str.isdigit():
            raise HTTPException(status_code=400, detail="Invalid port in target_host")
        return host_part, int(port_str)

    return raw, 80


def create_waf_instance(payload) -> int:
    """
    Creates waf_instances row and returns waf_id.
    Minimal + matches your table schema.
    """
    host, port = _normalize_target(payload.target_host)

    conn = get_conn()
    with conn.cursor() as cur:
        # keep your "single active instance" behavior
        cur.execute("UPDATE waf_instances SET is_active = FALSE WHERE is_active = TRUE")

        cur.execute(
            """
            INSERT INTO waf_instances (target_host, proxy_port, is_active)
            VALUES (%s, %s, TRUE)
            """,
            (host, int(payload.proxy_port)),
        )
        waf_id = cur.lastrowid

    if not waf_id:
        raise HTTPException(status_code=500, detail="Failed to create waf instance")

    return int(waf_id)


def setup_waf_controller(payload) -> dict:
    """
    Creates:
      1) waf_instances
      2) crawler_settings (tied to waf_id)
      3) admin user (tied to waf_id via your UserModel)
    """
    waf_id = create_waf_instance(payload)

    # 1) Create admin dashboard user
    UserModel.create_user(waf_id, payload.username, payload.password, role="admin")

    # 2) Save crawler settings tied to waf_id
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO crawler_settings (waf_id, login_endpoint, login_payload, excluded_endpoints, last_crawled)
            VALUES (%s, %s, %s, %s, NULL)
            """,
            (
                waf_id,
                payload.login_endpoint,
                json.dumps(payload.login_payload or {}, ensure_ascii=False),
                payload.excluded_endpoints,
            ),
        )

    return {"status": "ok", "waf_id": waf_id}
