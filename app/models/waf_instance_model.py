from __future__ import annotations
import json
import pymysql
from fastapi import HTTPException

class WAFInstanceModel:
    @staticmethod
    def get_by_target(conn, target_host_key: str):
        with conn.cursor() as cur:
            cur.execute(
                "SELECT waf_id FROM waf_instances WHERE target_host=%s LIMIT 1",
                (target_host_key,),
            )
            return cur.fetchone()

    @staticmethod
    def deactivate_all(conn):
        with conn.cursor() as cur:
            cur.execute("UPDATE waf_instances SET is_active = FALSE WHERE is_active = TRUE")

    @staticmethod
    def create_instance(conn, target_host_key: str, proxy_port: int, waf_mode: str) -> int:
        waf_mode = (waf_mode or "protect").strip().lower()
        if waf_mode not in ("shadow", "protect"):
            waf_mode = "protect"

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO waf_instances (target_host, waf_mode, proxy_port, is_active)
                VALUES (%s, %s, %s, TRUE)
                """,
                (target_host_key, waf_mode, int(proxy_port)),
            )
            waf_id = cur.lastrowid
        return int(waf_id)

