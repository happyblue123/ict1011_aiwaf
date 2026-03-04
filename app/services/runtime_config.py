# app/services/runtime_config.py
import pymysql
from fastapi import HTTPException
from app.db.db_config import get_conn

def get_active_waf_config() -> dict | None:
    """
    Returns active WAF config or None if:
      - database does not exist yet
      - schema not created yet
      - no instances exist
    
    If no active instance is found but instances exist, automatically
    reactivates the most recent one (for persistence across restarts).
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
            # First, try to get active instance
            cur.execute(
                """
                SELECT target_host, waf_mode, proxy_port
                FROM waf_instances
                WHERE is_active = TRUE
                ORDER BY waf_id DESC
                LIMIT 1
                """
            )
            result = cur.fetchone()
            
            # If no active instance, reactivate the most recent one
            if not result:
                cur.execute(
                    """
                    SELECT waf_id, target_host, waf_mode, proxy_port
                    FROM waf_instances
                    ORDER BY waf_id DESC
                    LIMIT 1
                    """
                )
                latest = cur.fetchone()
                if latest:
                    # Reactivate the most recent instance
                    cur.execute(
                        "UPDATE waf_instances SET is_active = TRUE WHERE waf_id = %s",
                        (latest["waf_id"],)
                    )
                    conn.commit()
                    # Return the config
                    return {
                        "target_host": latest["target_host"],
                        "waf_mode": latest["waf_mode"],
                        "proxy_port": latest["proxy_port"]
                    }
            
            return result
    except pymysql.err.ProgrammingError:
        # Table does not exist yet (schema not run)
        return None
    finally:
        conn.close()
