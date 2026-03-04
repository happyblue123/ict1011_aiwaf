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
        s = (s or "").strip()
        if not s:
            raise ValueError("empty datetime")

        s = s.replace("T", " ")

        try:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except Exception:
            pass

        dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        return dt

    @staticmethod
    def fetch_logs(
        search: str,
        since_utc: Optional[datetime],
        until_utc: Optional[datetime],
        limit: int,
        page: int,
        cursor_id: Optional[int] = None,
        is_live: bool = False,
        attack_type_filter: Optional[str] = None,
        action_filter: Optional[str] = None,
        country_filter: Optional[str] = None,
        method_filter: Optional[str] = None,
        ip_filter: Optional[str] = None,
    ):
        where = []
        params = []

        # 1. Global Search (Scans whole JSON text)
        if search:
            where.append("LOWER(CAST(raw_log AS CHAR)) LIKE %s")
            params.append(f"%{search.lower()}%")

        # 2. Attack Type Filter
        if attack_type_filter and attack_type_filter.lower() != "all":
            if attack_type_filter == "None":
                where.append("(JSON_EXTRACT(raw_log, '$.decision.reasons') IS NULL OR JSON_LENGTH(JSON_EXTRACT(raw_log, '$.decision.reasons')) = 0 OR JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.decision.reasons[0]')) LIKE 'baseline_allow%')")
            else:
                where.append("JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.decision.reasons[0]')) LIKE %s")
                params.append(f"{attack_type_filter}%")

        # 3. Action Filter
        if action_filter and action_filter.lower() != "all":
            where.append("(LOWER(JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.decision.effective_action'))) = %s OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.decision.action'))) = %s)")
            val = "allow" if action_filter == "ALLOWED" else ("block" if action_filter == "BLOCKED" else "flag")
            params.extend([val, val])

        # 4. Country Filter
        if country_filter and country_filter.lower() != "all":
            where.append("LOWER(JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.client.country'))) = %s")
            params.append(country_filter.lower())

        # 5. Method Filter
        if method_filter and method_filter.lower() != "all":
            where.append("UPPER(JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.method'))) = %s")
            params.append(method_filter.upper())

        # 6. IP Filter
        if ip_filter:
            where.append("(JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.client.ip')) LIKE %s OR JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.client_ip')) LIKE %s)")
            params.extend([f"%{ip_filter}%", f"%{ip_filter}%"])

        # 7. Time filters
        if is_live:
            if cursor_id is None:
                conn = get_conn()
                try:
                    with conn.cursor() as cur:
                        cur.execute("SELECT COALESCE(MAX(log_id), 0) AS max_id FROM event_logs")
                        cursor_id = int(cur.fetchone()["max_id"])
                finally:
                    conn.close()

            where.append("log_id > %s")
            params.append(cursor_id)
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

        types = sorted(set(types))
        return ["None"] + types

    @staticmethod
    def fetch_raw_logs_window(range: str, limit: int = 20000) -> List[Dict[str, Any]]:
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

    @staticmethod
    def fetch_latest_event_rows(limit: int = 50) -> List[Dict[str, Any]]:
        sql = """
            SELECT log_id, raw_log
            FROM event_logs
            ORDER BY log_id DESC
            LIMIT %s
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (int(limit),))
                rows = cur.fetchall() or []
        finally:
            conn.close()

        out: List[Dict[str, Any]] = []
        for r in rows:
            raw = r.get("raw_log")
            obj = raw if isinstance(raw, dict) else json.loads(raw)
            out.append({"log_id": r["log_id"], "raw_log": obj})
        return out
    

    @staticmethod
    def fetch_filter_options() -> Dict[str, List[str]]:
        """Scans the database for all unique dropdown filter options."""
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                # 1. Unique Attack Types
                cur.execute("""
                    SELECT DISTINCT SUBSTRING_INDEX(JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.decision.reasons[0]')), ':', 1) AS val
                    FROM event_logs WHERE JSON_EXTRACT(raw_log, '$.decision.reasons') IS NOT NULL
                """)
                attacks = [r["val"] for r in cur.fetchall() if r.get("val") and r["val"] != "null"]

                # 2. Unique HTTP Methods
                cur.execute("""
                    SELECT DISTINCT UPPER(JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.method'))) AS val
                    FROM event_logs WHERE JSON_EXTRACT(raw_log, '$.method') IS NOT NULL
                """)
                methods = [r["val"] for r in cur.fetchall() if r.get("val") and r["val"] != "null"]

                # 3. Unique Countries
                cur.execute("""
                    SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.client.country')) AS val
                    FROM event_logs WHERE JSON_EXTRACT(raw_log, '$.client.country') IS NOT NULL
                """)
                countries = [r["val"] for r in cur.fetchall() if r.get("val") and r["val"] != "null"]

                # 4. Unique Actions
                cur.execute("""
                    SELECT DISTINCT UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.decision.effective_action')), JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.decision.action')))) AS val
                    FROM event_logs
                """)
                actions = [r["val"] for r in cur.fetchall() if r.get("val") and r["val"] != "null"]

        finally:
            conn.close()

        # Clean up Attack Types
        clean_attacks = set()
        for a in attacks:
            if not a.startswith("baseline_allow"):
                clean_attacks.add(a)
        attacks_list = ["None"] + sorted(list(clean_attacks))

        # Standardize Actions to match UI (BLOCK -> BLOCKED)
        clean_actions = set()
        for a in actions:
            if a == "BLOCK": clean_actions.add("BLOCKED")
            elif a == "FLAG": clean_actions.add("FLAGGED")
            elif a == "ALLOW": clean_actions.add("ALLOWED")
            else: clean_actions.add(a)

        return {
            "attacks": attacks_list,
            "methods": sorted(list(set(methods))),
            "countries": sorted(list(set(countries))),
            "actions": sorted(list(clean_actions))
        }
    
    @staticmethod
    def fetch_filter_options() -> Dict[str, List[str]]:
        """Scans the database for all unique dropdown filter options."""
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                # 1. Unique Attack Types
                cur.execute("""
                    SELECT DISTINCT SUBSTRING_INDEX(JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.decision.reasons[0]')), ':', 1) AS val
                    FROM event_logs WHERE JSON_EXTRACT(raw_log, '$.decision.reasons') IS NOT NULL
                """)
                attacks = [r["val"] for r in cur.fetchall() if r and r.get("val") and r["val"] != "null"]

                # 2. Unique HTTP Methods
                cur.execute("""
                    SELECT DISTINCT UPPER(JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.method'))) AS val
                    FROM event_logs WHERE JSON_EXTRACT(raw_log, '$.method') IS NOT NULL
                """)
                methods = [r["val"] for r in cur.fetchall() if r and r.get("val") and r["val"] != "null"]

                # 3. Unique Countries
                cur.execute("""
                    SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.client.country')) AS val
                    FROM event_logs WHERE JSON_EXTRACT(raw_log, '$.client.country') IS NOT NULL
                """)
                countries = [r["val"] for r in cur.fetchall() if r and r.get("val") and r["val"] != "null"]

                # 4. Unique Actions
                cur.execute("""
                    SELECT DISTINCT UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.decision.effective_action')), JSON_UNQUOTE(JSON_EXTRACT(raw_log, '$.decision.action')))) AS val
                    FROM event_logs
                """)
                actions = [r["val"] for r in cur.fetchall() if r and r.get("val") and r["val"] != "null"]

        finally:
            conn.close()

        # Clean up Attack Types (remove duplicates and baseline allows)
        clean_attacks = set()
        for a in attacks:
            if not a.startswith("baseline_allow"):
                clean_attacks.add(a)
        attacks_list = ["None"] + sorted(list(clean_attacks))

        # Standardize Actions to match UI
        clean_actions = set()
        for a in actions:
            if a == "BLOCK": clean_actions.add("BLOCKED")
            elif a == "FLAG": clean_actions.add("FLAGGED")
            elif a == "ALLOW": clean_actions.add("ALLOWED")
            else: clean_actions.add(a)

        return {
            "attacks": attacks_list,
            "methods": sorted(list(set(methods))),
            "countries": sorted(list(set(countries))),
            "actions": sorted(list(clean_actions))
        }