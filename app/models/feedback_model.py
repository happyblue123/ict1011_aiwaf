from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from app.db.db_config import get_conn


class FeedbackModel:

    @staticmethod
    def insert(log_id: int, user_id: int, label: str, notes: Optional[str] = None) -> int:
        sql = """
            INSERT INTO analyst_feedback (log_id, user_id, label, notes)
            VALUES (%s, %s, %s, %s)
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (log_id, user_id, label, notes))
                return cur.lastrowid
        finally:
            conn.close()

    @staticmethod
    def get_by_log_id(log_id: int) -> Optional[Dict[str, Any]]:
        sql = "SELECT * FROM analyst_feedback WHERE log_id = %s LIMIT 1"
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (log_id,))
                return cur.fetchone()
        finally:
            conn.close()

    @staticmethod
    def get_stats() -> Dict[str, Any]:
        sql = """
            SELECT
                COUNT(*)                                          AS total,
                SUM(label = 'correct')                            AS correct_count,
                SUM(label = 'false_positive')                     AS false_positive_count,
                SUM(label = 'false_negative')                     AS false_negative_count
            FROM analyst_feedback
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql)
                row = cur.fetchone()
        finally:
            conn.close()

        total = int(row["total"] or 0)
        correct = int(row["correct_count"] or 0)
        fp = int(row["false_positive_count"] or 0)
        fn = int(row["false_negative_count"] or 0)
        precision = round(correct / total * 100, 1) if total > 0 else 0.0

        return {
            "total": total,
            "correct_count": correct,
            "false_positive_count": fp,
            "false_negative_count": fn,
            "precision_pct": precision,
        }

    @staticmethod
    def batch_check(log_ids: List[int]) -> Dict[int, str]:
        if not log_ids:
            return {}
        placeholders = ",".join(["%s"] * len(log_ids))
        sql = f"SELECT log_id, label FROM analyst_feedback WHERE log_id IN ({placeholders})"
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(log_ids))
                rows = cur.fetchall()
        finally:
            conn.close()
        return {int(r["log_id"]): r["label"] for r in rows}

    @staticmethod
    def get_log_by_id(log_id: int) -> Optional[Dict[str, Any]]:
        sql = "SELECT log_id, raw_log FROM event_logs WHERE log_id = %s"
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (log_id,))
                row = cur.fetchone()
        finally:
            conn.close()
        if not row:
            return None
        raw = row["raw_log"]
        obj = raw if isinstance(raw, dict) else json.loads(raw)
        return {"log_id": row["log_id"], "raw_log": obj}
