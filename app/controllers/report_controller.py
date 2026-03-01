"""
Controller for auto-report settings and manual send.
"""
from __future__ import annotations

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

        if not row:
            return {
                "enabled": False,
                "recipient_email": "",
                "frequency": "daily",
                "smtp_user": "",
                "smtp_password": "",
                "last_sent_at": None,
            }

        return {
            "enabled": bool(row["enabled"]),
            "recipient_email": row["recipient_email"] or "",
            "frequency": row["frequency"] or "daily",
            "smtp_user": row["smtp_user"] or "",
            "smtp_password": row["smtp_password"] or "",
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
                        smtp_user       = %s,
                        smtp_password   = %s
                    WHERE id = 1
                    """,
                    (
                        bool(data.get("enabled", False)),
                        data.get("recipient_email", "") or "",
                        data.get("frequency", "daily") or "daily",
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

        smtp_user = row.get("smtp_user", "")
        smtp_password = row.get("smtp_password", "")
        recipient = row.get("recipient_email", "")

        if not smtp_user or not smtp_password or not recipient:
            return {"status": "error", "message": "Missing SMTP credentials or recipient email"}

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
