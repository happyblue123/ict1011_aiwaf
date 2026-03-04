"""
Background scheduler for auto-sending PDF security reports.
Runs as a daemon thread — checks every 60 seconds if a report is due.
"""
from __future__ import annotations

import os
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
    """Check if a scheduled report time has arrived.

    New behavior supports:
      * daily at a specific time
      * weekly on a given weekday + time
      * monthly on a given day-of-month + time

    The stored fields are:
      schedule_time: "HH:MM" string
      schedule_dow: integer 0=Mon..6=Sun (weekly only)
      schedule_dom: integer 1..31 (monthly only)
    """
    if not settings.get("enabled"):
        return False

    freq = settings.get("frequency", "daily")
    now = datetime.now(timezone.utc)

    # parse schedule_time
    sched_t = settings.get("schedule_time") or "00:00"
    try:
        h, m = map(int, sched_t.split(":"))
        sched_time = now.replace(hour=h, minute=m, second=0, microsecond=0)
    except Exception:
        # fallback to midnight
        sched_time = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # determine the most recent candidate send datetime (UTC)
    candidate = None
    if freq == "daily":
        candidate = sched_time
        if now < candidate:
            candidate -= timedelta(days=1)
    elif freq == "weekly":
        dow = settings.get("schedule_dow")
        if dow is None:
            dow = 0
        # python weekday: Monday=0
        days_diff = (now.weekday() - dow) % 7
        candidate_date = (now - timedelta(days=days_diff)).date()
        candidate = datetime(
            candidate_date.year,
            candidate_date.month,
            candidate_date.day,
            sched_time.hour,
            sched_time.minute,
            tzinfo=timezone.utc,
        )
        if now < candidate:
            candidate -= timedelta(days=7)
    elif freq == "monthly":
        dom = settings.get("schedule_dom") or 1
        year = now.year
        month = now.month
        if now.day < dom or (now.day == dom and now.time() < sched_time.time()):
            month -= 1
            if month == 0:
                month = 12
                year -= 1
        import calendar
        last_day = calendar.monthrange(year, month)[1]
        day = min(dom, last_day)
        candidate = datetime(
            year,
            month,
            day,
            sched_time.hour,
            sched_time.minute,
            tzinfo=timezone.utc,
        )
    else:
        # unknown frequency, fall back to interval check
        delta = _FREQ_DELTA.get(freq, timedelta(hours=24))
        last_sent = settings.get("last_sent_at")
        if last_sent is None:
            return True
        if isinstance(last_sent, str):
            last_sent = datetime.fromisoformat(last_sent)
        if last_sent.tzinfo is None:
            last_sent = last_sent.replace(tzinfo=timezone.utc)
        return (now - last_sent) >= delta

    # if we have no candidate something's wrong
    if candidate is None:
        return False

    last_sent = settings.get("last_sent_at")
    if last_sent is None:
        return True  # never sent before
    if isinstance(last_sent, str):
        last_sent = datetime.fromisoformat(last_sent)
    if last_sent.tzinfo is None:
        last_sent = last_sent.replace(tzinfo=timezone.utc)

    return last_sent < candidate <= now


def _send_report(settings: dict, env_smtp_user: str = "", env_smtp_password: str = ""):
    """Generate PDF and send email."""
    # Lazy imports to avoid circular imports at module load
    from app.services.report_service import generate_report_pdf
    from app.services.email_service import send_report_email

    freq = settings.get("frequency", "daily")
    period = _FREQ_PERIOD.get(freq, "24h")

    recipient = settings.get("recipient_email", "")
    smtp_user = settings.get("smtp_user", "") or env_smtp_user
    smtp_password = settings.get("smtp_password", "") or env_smtp_password

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


def _scheduler_loop(env_smtp_user: str = "", env_smtp_password: str = ""):
    """Main loop — runs forever in a daemon thread."""
    # Wait a bit on startup to let the app fully initialize
    time.sleep(10)
    print("[ReportScheduler] Started", flush=True)

    while True:
        try:
            settings = _read_settings()
            if settings and _is_report_due(settings):
                _send_report(settings, env_smtp_user, env_smtp_password)
        except Exception as e:
            print(f"[ReportScheduler] Loop error: {e}", flush=True)

        time.sleep(_CHECK_INTERVAL)


def start_scheduler():
    """Start the background scheduler thread. Call once from main.py startup."""
    env_smtp_user = os.getenv("SMTP_SENDER_GMAIL", "")
    env_smtp_password = os.getenv("SMTP_APP_PASSWORD", "")
    t = threading.Thread(target=_scheduler_loop, args=(env_smtp_user, env_smtp_password), daemon=True, name="report-scheduler")
    t.start()
    print("[ReportScheduler] Thread launched", flush=True)
