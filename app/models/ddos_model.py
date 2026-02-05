from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from app.db.db_config import get_conn


class DdosModel:
    @staticmethod
    def ensure_settings_row() -> None:
        sql = """
        INSERT INTO ddos_settings (id, is_active, mode, modules)
        VALUES (1, TRUE, 'Adaptive AI Rate-Limiting', JSON_ARRAY(
            JSON_OBJECT('label','Volumetric Rate Limiter','active', TRUE),
            JSON_OBJECT('label','Behavioral Bot Detection','active', TRUE),
            JSON_OBJECT('label','Zombie-Request Filtering','active', FALSE)
        ))
        ON DUPLICATE KEY UPDATE id = id
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql)
        finally:
            conn.close()

    @staticmethod
    def get_settings() -> Dict[str, Any]:
        DdosModel.ensure_settings_row()
        sql = """
        SELECT is_active, mode, modules, updated_at
        FROM ddos_settings
        WHERE id = 1
        LIMIT 1
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql)
                row = cur.fetchone() or {}
        finally:
            conn.close()

        modules = row.get("modules")
        if isinstance(modules, (str, bytes, bytearray)):
            try:
                modules = json.loads(modules)
            except Exception:
                modules = []

        return {
            "is_active": bool(row.get("is_active", True)),
            "mode": row.get("mode") or "Adaptive AI Rate-Limiting",
            "modules": modules or [],
            "updated_at": row.get("updated_at"),
        }

    @staticmethod
    def update_settings(
        is_active: Optional[bool],
        mode: Optional[str],
        modules: Optional[List[Dict[str, Any]]],
    ) -> Dict[str, Any]:
        DdosModel.ensure_settings_row()

        current = DdosModel.get_settings()
        new_is_active = current["is_active"] if is_active is None else bool(is_active)
        new_mode = current["mode"] if not mode else mode
        new_modules = current["modules"] if modules is None else modules

        sql = """
        UPDATE ddos_settings
        SET is_active = %s, mode = %s, modules = %s
        WHERE id = 1
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (new_is_active, new_mode, json.dumps(new_modules)))
        finally:
            conn.close()

        return DdosModel.get_settings()

    @staticmethod
    def fetch_raw_logs_since(since_iso: str, limit: int = 20000) -> List[Dict[str, Any]]:
        sql = """
        SELECT raw_log
        FROM event_logs
        WHERE JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.ts')) >= %s
        ORDER BY log_id DESC
        LIMIT %s
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (since_iso, limit))
                rows = cur.fetchall() or []
        finally:
            conn.close()

        return rows
