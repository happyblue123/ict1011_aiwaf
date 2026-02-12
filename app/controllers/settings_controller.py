from __future__ import annotations

import bcrypt
from fastapi import HTTPException
from app.db.db_config import get_conn


class SettingsController:
    """Handles GET / PUT for the System Configuration page."""

    # ── GET /api/settings ──────────────────────────────────
    @staticmethod
    def get_settings(user_id: int) -> dict:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                # 1) Current user profile
                cur.execute(
                    "SELECT username, role FROM users WHERE user_id = %s LIMIT 1",
                    (user_id,),
                )
                user = cur.fetchone() or {}

                # 2) Active WAF instance
                cur.execute(
                    """
                    SELECT waf_id, target_host, waf_mode, proxy_port, is_active
                    FROM waf_instances
                    WHERE is_active = TRUE
                    ORDER BY waf_id DESC LIMIT 1
                    """
                )
                waf = cur.fetchone()

                # 3) Global toggles (single-row, id=1)
                cur.execute("SELECT * FROM waf_settings WHERE id = 1")
                toggles = cur.fetchone()

            return {
                "profile": {
                    "username": user.get("username", ""),
                    "role": user.get("role", "analyst"),
                },
                "waf": {
                    "target_host": waf["target_host"] if waf else None,
                    "waf_mode": waf["waf_mode"] if waf else "protect",
                    "proxy_port": waf["proxy_port"] if waf else 8000,
                    "is_active": bool(waf["is_active"]) if waf else False,
                },
                "toggles": {
                    "email_alerts": bool(toggles["email_alerts"]) if toggles else True,
                    "sms_alerts": bool(toggles["sms_alerts"]) if toggles else False,
                    "geo_blocking": bool(toggles["geo_blocking"]) if toggles else True,
                    "rate_limiting": bool(toggles["rate_limiting"]) if toggles else True,
                },
            }
        finally:
            conn.close()

    # ── PUT /api/settings ──────────────────────────────────
    @staticmethod
    def update_settings(user_id: int, data: dict) -> dict:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                # ── Profile updates ────────────────────────
                profile = data.get("profile")
                if profile:
                    new_password = profile.get("new_password")
                    if new_password:
                        pw_hash = bcrypt.hashpw(
                            new_password.encode("utf-8"),
                            bcrypt.gensalt(),
                        ).decode("utf-8")
                        cur.execute(
                            "UPDATE users SET password_hash = %s WHERE user_id = %s",
                            (pw_hash, user_id),
                        )

                # ── WAF mode update ────────────────────────
                waf = data.get("waf")
                if waf:
                    mode = waf.get("waf_mode")
                    if mode in ("shadow", "protect"):
                        cur.execute(
                            """
                            UPDATE waf_instances SET waf_mode = %s
                            WHERE is_active = TRUE
                            ORDER BY waf_id DESC LIMIT 1
                            """,
                            (mode,),
                        )

                # ── Toggles update ─────────────────────────
                toggles = data.get("toggles")
                if toggles:
                    cur.execute(
                        """
                        INSERT INTO waf_settings (id, email_alerts, sms_alerts, geo_blocking, rate_limiting)
                        VALUES (1, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE
                            email_alerts  = VALUES(email_alerts),
                            sms_alerts    = VALUES(sms_alerts),
                            geo_blocking  = VALUES(geo_blocking),
                            rate_limiting = VALUES(rate_limiting)
                        """,
                        (
                            bool(toggles.get("email_alerts", True)),
                            bool(toggles.get("sms_alerts", False)),
                            bool(toggles.get("geo_blocking", True)),
                            bool(toggles.get("rate_limiting", True)),
                        ),
                    )

            return {"status": "ok"}
        finally:
            conn.close()
