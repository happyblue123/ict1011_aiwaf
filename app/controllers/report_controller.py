"""
Controller for auto-report settings and manual send.
"""
from __future__ import annotations

import os
from app.db.db_config import get_conn
from app.services.report_service import generate_report_pdf
from app.services.email_service import send_report_email


class ReportController:

    @staticmethod
    def get_settings() -> dict:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM report_settings WHERE id = 1")
                row = cur.fetchone()
        finally:
            conn.close()

        # If there is no row yet return the defaults.  We also
        # include environment fallbacks so that the SMTP credentials
        # coming from .env are visible to the frontend even before the
        # user has saved anything.
        if not row:
            return {
                "enabled": False,
                "recipient_email": "",
                "frequency": "daily",
                "schedule_time": "00:00",
                "schedule_dow": None,
                "schedule_dom": None,
                "smtp_user": os.getenv("SMTP_SENDER_GMAIL", ""),
                "smtp_password": os.getenv("SMTP_APP_PASSWORD", ""),
                "last_sent_at": None,
            }

        # Use values from the database, but fall back to environment
        # variables when the fields are empty strings.
        return {
            "enabled": bool(row["enabled"]),
            "recipient_email": row["recipient_email"] or "",
            "frequency": row["frequency"] or "daily",
            "schedule_time": (row.get("schedule_time") or "00:00"),
            "schedule_dow": row.get("schedule_dow"),
            "schedule_dom": row.get("schedule_dom"),
            "smtp_user": row["smtp_user"] or os.getenv("SMTP_SENDER_GMAIL", ""),
            "smtp_password": row["smtp_password"] or os.getenv("SMTP_APP_PASSWORD", ""),
            "last_sent_at": row["last_sent_at"].isoformat() if row["last_sent_at"] else None,
        }

    @staticmethod
    def update_settings(data: dict) -> dict:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE report_settings
                    SET enabled         = %s,
                        recipient_email = %s,
                        frequency       = %s,
                        schedule_time   = %s,
                        schedule_dow    = %s,
                        schedule_dom    = %s,
                        smtp_user       = %s,
                        smtp_password   = %s
                    WHERE id = 1
                    """,
                    (
                        bool(data.get("enabled", False)),
                        data.get("recipient_email", "") or "",
                        data.get("frequency", "daily") or "daily",
                        data.get("schedule_time", "00:00"),
                        data.get("schedule_dow"),
                        data.get("schedule_dom"),
                        data.get("smtp_user", "") or "",
                        data.get("smtp_password", "") or "",
                    ),
                )
        finally:
            conn.close()

        return {"status": "ok"}

    @staticmethod
    def send_now() -> dict:
        """Manually trigger a report generation + email."""
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM report_settings WHERE id = 1")
                row = cur.fetchone()
        finally:
            conn.close()

        if not row:
            return {"status": "error", "message": "Report settings not configured"}

        # Fall back to environment variables for SMTP credentials if DB values are empty
        smtp_user = row.get("smtp_user") or os.getenv("SMTP_SENDER_GMAIL", "")
        smtp_password = row.get("smtp_password") or os.getenv("SMTP_APP_PASSWORD", "")
        recipient = row.get("recipient_email", "")

        # Debug logging
        print(f"[Report Debug] SMTP User: {smtp_user[:20]}..." if smtp_user else "[Report Debug] SMTP User: EMPTY")
        print(f"[Report Debug] SMTP Password: {'***' if smtp_password else 'EMPTY'}")
        print(f"[Report Debug] Recipient: {recipient if recipient else 'EMPTY'}")

        if not smtp_user or not smtp_password or not recipient:
            missing = []
            if not smtp_user:
                missing.append("sender email")
            if not smtp_password:
                missing.append("app password")
            if not recipient:
                missing.append("recipient email")
            return {"status": "error", "message": f"Missing: {', '.join(missing)}. Did you save the settings?"}

        try:
            pdf_bytes = generate_report_pdf(period="24h")
            send_report_email(smtp_user, smtp_password, recipient, pdf_bytes)

            # Update last_sent_at
            conn = get_conn()
            try:
                with conn.cursor() as cur:
                    cur.execute("UPDATE report_settings SET last_sent_at = NOW() WHERE id = 1")
            finally:
                conn.close()

            return {"status": "ok", "message": f"Report sent to {recipient}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
