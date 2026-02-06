from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from app.db.db_config import get_conn


class PolicyModel:
    @staticmethod
    def fetch_rules(list_type: Optional[str] = None) -> List[Dict[str, Any]]:
        sql = """
        SELECT rule_id, list_type, ip_address, reason, created_by, expires_at, created_at
        FROM ip_policy_rules
        {where_clause}
        ORDER BY created_at DESC
        """
        where_clause = ""
        params: tuple[Any, ...] = ()
        if list_type:
            where_clause = "WHERE list_type = %s"
            params = (list_type,)
        sql = sql.format(where_clause=where_clause)

        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchall()
        finally:
            conn.close()

    @staticmethod
    def create_rule(
        list_type: str,
        ip_address: str,
        reason: Optional[str],
        created_by: Optional[str],
        expires_at: Optional[datetime],
    ) -> Dict[str, Any]:
        sql = """
        INSERT INTO ip_policy_rules (list_type, ip_address, reason, created_by, expires_at)
        VALUES (%s, %s, %s, %s, %s)
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (list_type, ip_address, reason, created_by, expires_at))
                rule_id = cur.lastrowid
        finally:
            conn.close()

        return PolicyModel.fetch_rule(rule_id)

    @staticmethod
    def fetch_rule(rule_id: int) -> Dict[str, Any]:
        sql = """
        SELECT rule_id, list_type, ip_address, reason, created_by, expires_at, created_at
        FROM ip_policy_rules
        WHERE rule_id = %s
        LIMIT 1
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (rule_id,))
                row = cur.fetchone()
                return row
        finally:
            conn.close()

    @staticmethod
    def delete_rule(rule_id: int) -> bool:
        sql = "DELETE FROM ip_policy_rules WHERE rule_id = %s"
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (rule_id,))
                return cur.rowcount > 0
        finally:
            conn.close()

    @staticmethod
    def get_policy_for_ip(ip_address: Optional[str]) -> Optional[Dict[str, Any]]:
        if not ip_address:
            return None

        sql = """
        SELECT list_type, reason, expires_at
        FROM ip_policy_rules
        WHERE ip_address = %s
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY FIELD(list_type, 'whitelist', 'blacklist')
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (ip_address,))
                rows = cur.fetchall()
        finally:
            conn.close()

        if not rows:
            return None

        has_whitelist = next((row for row in rows if row["list_type"] == "whitelist"), None)
        if has_whitelist:
            return {
                "list_type": "whitelist",
                "reason": has_whitelist.get("reason"),
            }

        has_blacklist = next((row for row in rows if row["list_type"] == "blacklist"), None)
        if has_blacklist:
            return {
                "list_type": "blacklist",
                "reason": has_blacklist.get("reason"),
            }

        return None
    
    @staticmethod
    def fetch_active_rules(list_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch only active (non-expired) rules.
        """
        sql = """
        SELECT rule_id, list_type, ip_address, reason, created_by, expires_at, created_at, updated_at
        FROM ip_policy_rules
        WHERE (expires_at IS NULL OR expires_at > NOW())
        {and_clause}
        ORDER BY created_at DESC
        """

        and_clause = ""
        params: tuple[Any, ...] = ()
        if list_type:
            and_clause = "AND list_type = %s"
            params = (list_type,)

        sql = sql.format(and_clause=and_clause)

        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchall() or []
        finally:
            conn.close()
        
    @staticmethod
    def count_active_by_type() -> Dict[str, int]:
        sql = """
            SELECT list_type, COUNT(*) AS c
            FROM ip_policy_rules
            WHERE (expires_at IS NULL OR expires_at > NOW())
            GROUP BY list_type
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql)
                rows = cur.fetchall() or []
        finally:
            conn.close()

        out = {"whitelist": 0, "blacklist": 0}
        for r in rows:
            t = r.get("list_type")
            if t in out:
                out[t] = int(r.get("c") or 0)
        return out