# app/models/user_model.py

import bcrypt
from app.db.db_config import get_conn
from fastapi import HTTPException

class UserModel:
    @staticmethod
    def create_user(waf_id: int, username: str, password: str, role: str = "admin") -> int:
        pw_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

        sql = """
        INSERT INTO users (waf_id, username, password_hash, role)
        VALUES (%s, %s, %s, %s)
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (waf_id, username, pw_hash, role))
                return int(cur.lastrowid)
        except Exception as e:
            # common: duplicate username
            raise HTTPException(status_code=400, detail=f"Failed to create user: {e}")
    
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
