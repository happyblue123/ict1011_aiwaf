from __future__ import annotations
import pymysql
from urllib.parse import urlparse
from fastapi import HTTPException

from app.db.db_config import get_conn
from app.models.user_model import UserModel
from app.models.waf_instance_model import WAFInstanceModel

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

def _target_key(host: str, port: int) -> str:
    return f"{host}:{int(port)}"

def setup_waf_controller(payload) -> dict:
    host, port = _normalize_target(payload.target_host)
    target_host_key = _target_key(host, port)

    conn = get_conn()
    try:
        conn.begin()

        # Prevent duplicates (friendly 409)
        if WAFInstanceModel.get_by_target(conn, target_host_key):
            raise HTTPException(
                status_code=409,
                detail=f"WAF instance already exists for target {target_host_key}. This target is already protected."
            )

        # OPTIONAL: single-active-instance behavior
        WAFInstanceModel.deactivate_all(conn)

        # Create instance
        waf_id = WAFInstanceModel.create_instance(conn, target_host_key, payload.proxy_port, payload.waf_mode)

        # Create admin user (same conn)
        UserModel.create_user(waf_id, payload.username, payload.password, role="admin", conn=conn)

        # Save crawler settings
        WAFInstanceModel.save_crawler_settings(
            conn,
            waf_id=waf_id,
            login_endpoint=payload.login_endpoint,
            login_payload=payload.login_payload,
            excluded_endpoints=payload.excluded_endpoints,
        )

        conn.commit()
        return {"status": "ok", "waf_id": waf_id}

    except HTTPException:
        conn.rollback()
        raise

    except pymysql.err.IntegrityError as e:
        conn.rollback()
        # 1062 duplicate key (could be target_host or username)
        if e.args and e.args[0] == 1062:
            raise HTTPException(
                status_code=409,
                detail=f"Duplicate record detected. Target or username already exists. ({e})"
            ) from e
        raise HTTPException(status_code=500, detail=f"Database integrity error: {e}") from e

    except pymysql.err.ProgrammingError as e:
        conn.rollback()
        # schema mismatch: missing columns/tables
        raise HTTPException(status_code=500, detail=f"Database schema error: {e}") from e

    except pymysql.err.OperationalError as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database operational error: {e}") from e

    except Exception as e:
        conn.rollback()
        # ✅ show the real error to you + frontend
        raise HTTPException(status_code=500, detail=f"Failed to setup WAF: {type(e).__name__}: {e}") from e

    finally:
        conn.close()