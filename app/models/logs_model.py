# app/models/logs.py
from __future__ import annotations

import json
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.db.db_config import get_conn


class LogsModel:
    @staticmethod
    def insert_event_log(event: Dict[str, Any]) -> int:
        """
        Insert a raw JSON event into event_logs.raw_log.
        Returns inserted log_id.
        """
        sql = "INSERT INTO event_logs (raw_log) VALUES (%s)"

        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (json.dumps(event, ensure_ascii=False),))
                return cur.lastrowid
        finally:
            conn.close()
    
    @staticmethod
    def parse_datetime_to_utc(s: str) -> datetime:
        """
        Accepts:
        - 'YYYY-MM-DD HH:MM:SS' (from your UI live mode)
        - ISO '2026-02-04T05:48:03.751383+00:00'
        Returns UTC datetime (aware).
        """
        s = (s or "").strip()
        if not s:
            raise ValueError("empty datetime")

        # datetime-local from input gives "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS"
        s = s.replace("T", " ")

        # If has timezone in ISO, fromisoformat handles it
        try:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                # treat naive as local? better: treat as UTC
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except Exception:
            pass

        # fallback: strict MySQL format
        dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        return dt

    @staticmethod
    def fetch_logs(
        search: str,
        attack_type: str,
        since_utc: Optional[datetime],
        until_utc: Optional[datetime],
        limit: int,
        page: int,
        cursor_id: Optional[int] = None,
        is_live: bool = False,
    ):
        where = []
        params = []

        # (your existing search/attack_type filters here...)

        if is_live:
            # If cursor_id is None, start from "now" by returning nothing initially.
            # Simplest: set cursor to current max(log_id)
            if cursor_id is None:
                # fetch max id
                conn = get_conn()
                try:
                    with conn.cursor() as cur:
                        cur.execute("SELECT COALESCE(MAX(log_id), 0) AS max_id FROM event_logs")
                        cursor_id = int(cur.fetchone()["max_id"])
                finally:
                    conn.close()

            where.append("log_id > %s")
            params.append(cursor_id)

            # In live mode, total/pages is kind of meaningless; but keep it consistent:
            # We can set total = number of rows matching cursor filter.
            # (optional) you may just return total = len(rows)
        else:
            if since_utc:
                where.append("JSON_EXTRACT(raw_log, '$.ts') >= %s")
                params.append(since_utc.isoformat())

            if until_utc:
                where.append("JSON_EXTRACT(raw_log, '$.ts') <= %s")
                params.append(until_utc.isoformat())

        where_sql = ("WHERE " + " AND ".join(where)) if where else ""
        offset = (page - 1) * limit

        sql_rows = f"""
            SELECT log_id, raw_log
            FROM event_logs
            {where_sql}
            ORDER BY log_id DESC
            LIMIT %s OFFSET %s
        """

        sql_count = f"""
            SELECT COUNT(*) AS total
            FROM event_logs
            {where_sql}
        """

        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql_count, (*params,))
                total = int(cur.fetchone()["total"])

                cur.execute(sql_rows, (*params, limit, offset))
                rows = cur.fetchall()
        finally:
            conn.close()

        return rows, total

    @staticmethod
    def fetch_attack_types(limit: int = 50) -> List[str]:
        """
        Returns a list like ["None", "cmd_injection", "sql_injection", ...]
        Derived from decision.reasons[0] prefix in raw_log JSON.
        """
        sql = """
        SELECT DISTINCT
          SUBSTRING_INDEX(
            JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.decision.reasons[0]')),
            ':',
            1
          ) AS attack_type
        FROM event_logs
        WHERE JSON_EXTRACT(raw_log, '$.decision.reasons') IS NOT NULL
          AND JSON_LENGTH(JSON_EXTRACT(raw_log, '$.decision.reasons')) > 0
        LIMIT %s
        """

        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (limit,))
                rows = cur.fetchall() or []
        finally:
            conn.close()

        types = []
        for r in rows:
            t = r.get("attack_type")
            if t and t != "null":
                types.append(t)

        # Always include None at top so UI can show "Normal Traffic"
        # Also de-dupe and sort for stable UI.
        types = sorted(set(types))
        return ["None"] + types

    @staticmethod
    def fetch_raw_logs_window(range: str, limit: int = 20000) -> List[Dict[str, Any]]:
        """
        Fetch raw_log objects within a time window using JSON_EXTRACT on $.ts.
        This avoids pulling a large LIMIT and filtering in Python.

        range: "24h" | "7d"
        limit: safety cap
        Returns: list[dict] (decoded raw_log)
        """
        r = (range or "").lower().strip()
        if r == "7d":
            start = datetime.now(timezone.utc) - timedelta(days=7)
        else:
            start = datetime.now(timezone.utc) - timedelta(hours=24)

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
                cur.execute(sql, (start.isoformat(), limit))
                rows = cur.fetchall() or []
        finally:
            conn.close()

        out: List[Dict[str, Any]] = []
        for r in rows:
            raw = r.get("raw_log")
            obj = raw if isinstance(raw, dict) else json.loads(raw)
            out.append(obj)
        return out