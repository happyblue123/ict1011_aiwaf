# app/models/user_model.py

import bcrypt
from app.db.db_config import get_conn
from fastapi import HTTPException

class UserModel:
    @staticmethod
    def create_user(waf_id: int, username: str, password: str, role: str = "admin", conn=None):
        close_conn = False
        if conn is None:
            conn = get_conn()
            close_conn = True

        try:
            pw_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (waf_id, username, password_hash, role)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (waf_id, username, pw_hash, role),
                )
        except Exception as e:
            # keep message safe if you want, but raise up
            raise Exception(f"Failed to create user: {e}")
        finally:
            if close_conn:
                conn.close()
    
    @staticmethod
    def authenticate(username: str, password: str):
        sql = """
        SELECT user_id, username, password_hash, role
        FROM users
        WHERE username = %s
        LIMIT 1
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (username,))
                user = cur.fetchone()
        finally:
            conn.close()

        if not user:
            return None

        stored = user["password_hash"]

        # if password == stored :
        #     return user
            
        if isinstance(stored, str):
            stored = stored.encode()

        if not bcrypt.checkpw(password.encode(), stored):
            return None

        return user
