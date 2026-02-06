# app/services/runtime_config.py
import pymysql
from fastapi import HTTPException
from app.db.db_config import get_conn

def get_active_waf_config() -> dict | None:
    """
    Returns active WAF config or None if:
      - database does not exist yet
      - schema not created yet
      - no active instance
    """
    try:
        conn = get_conn()
    except pymysql.err.OperationalError as e:
        # 1049 = Unknown database
        if e.args and e.args[0] == 1049:
            return None
        raise

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT target_host, waf_mode, proxy_port
                FROM waf_instances
                WHERE is_active = TRUE
                ORDER BY waf_id DESC
                LIMIT 1
                """
            )
            return cur.fetchone()
    except pymysql.err.ProgrammingError:
        # Table does not exist yet (schema not run)
        return None
    finally:
        conn.close()
