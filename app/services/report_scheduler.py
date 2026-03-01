"""
Background scheduler for auto-sending PDF security reports.
Runs as a daemon thread — checks every 60 seconds if a report is due.
"""
from __future__ import annotations

import time
import threading
from datetime import datetime, timezone, timedelta

from app.db.db_config import get_conn


_CHECK_INTERVAL = 60  # seconds between checks

# Map frequency → minimum interval between sends
_FREQ_DELTA = {
    "daily": timedelta(hours=24),
    "weekly": timedelta(days=7),
    "monthly": timedelta(days=30),
}

# Map frequency → report period for PDF
_FREQ_PERIOD = {
    "daily": "24h",
    "weekly": "7d",
    "monthly": "7d",  # fetch_raw_logs_window max is 7d
}


def _read_settings() -> dict | None:
    """Read report_settings row from DB."""
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM report_settings WHERE id = 1")
            row = cur.fetchone()
        conn.close()
        return row
    except Exception as e:
        print(f"[ReportScheduler] DB read error: {e}", flush=True)
        return None


def _update_last_sent():
    """Mark the report as just sent."""
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE report_settings SET last_sent_at = NOW() WHERE id = 1"
            )
        conn.close()
    except Exception as e:
        print(f"[ReportScheduler] DB update error: {e}", flush=True)


def _is_report_due(settings: dict) -> bool:
    """Check if enough time has passed since last_sent_at."""
    if not settings.get("enabled"):
        return False

    freq = settings.get("frequency", "daily")
    delta = _FREQ_DELTA.get(freq, timedelta(hours=24))

    last_sent = settings.get("last_sent_at")
    if last_sent is None:
        return True  # never sent before

    if isinstance(last_sent, str):
        last_sent = datetime.fromisoformat(last_sent)

    if last_sent.tzinfo is None:
        last_sent = last_sent.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    return (now - last_sent) >= delta


def _send_report(settings: dict):
    """Generate PDF and send email."""
    # Lazy imports to avoid circular imports at module load
    from app.services.report_service import generate_report_pdf
    from app.services.email_service import send_report_email

    freq = settings.get("frequency", "daily")
    period = _FREQ_PERIOD.get(freq, "24h")

    recipient = settings.get("recipient_email", "")
    smtp_user = settings.get("smtp_user", "")
    smtp_password = settings.get("smtp_password", "")

    if not recipient or not smtp_user or not smtp_password:
        print("[ReportScheduler] Missing email config, skipping", flush=True)
        return

    try:
        print(f"[ReportScheduler] Generating {freq} report...", flush=True)
        pdf_bytes = generate_report_pdf(period=period)
        send_report_email(smtp_user, smtp_password, recipient, pdf_bytes)
        _update_last_sent()
        print(f"[ReportScheduler] Report sent to {recipient}", flush=True)
    except Exception as e:
        print(f"[ReportScheduler] Failed: {e}", flush=True)


def _scheduler_loop():
    """Main loop — runs forever in a daemon thread."""
    # Wait a bit on startup to let the app fully initialize
    time.sleep(10)
    print("[ReportScheduler] Started", flush=True)

    while True:
        try:
            settings = _read_settings()
            if settings and _is_report_due(settings):
                _send_report(settings)
        except Exception as e:
            print(f"[ReportScheduler] Loop error: {e}", flush=True)

        time.sleep(_CHECK_INTERVAL)


def start_scheduler():
    """Start the background scheduler thread. Call once from main.py startup."""
    t = threading.Thread(target=_scheduler_loop, daemon=True, name="report-scheduler")
    t.start()
    print("[ReportScheduler] Thread launched", flush=True)
