"""
Email service for sending PDF reports via Gmail SMTP.
Uses built-in smtplib — no external dependencies.
"""
from __future__ import annotations

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders
from datetime import datetime, timezone


SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587


def send_report_email(
    smtp_user: str,
    smtp_password: str,
    recipient: str,
    pdf_bytes: bytes,
    subject: str | None = None,
) -> None:
    """
    Send a PDF report as an email attachment via Gmail SMTP.
    Raises on failure so the caller can log the error.
    """
    if not smtp_user or not smtp_password or not recipient:
        raise ValueError("SMTP credentials and recipient email are required")

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not subject:
        subject = f"NeuroWAF Security Report — {date_str}"

    msg = MIMEMultipart()
    msg["From"] = smtp_user
    msg["To"] = recipient
    msg["Subject"] = subject

    # Email body
    body = (
        "Hello,\n\n"
        "Please find attached your scheduled NeuroWAF Security Report.\n\n"
        f"Report Date: {date_str}\n"
        "This is an automated email from the NeuroWAF AI Security Platform.\n\n"
        "— NeuroWAF"
    )
    msg.attach(MIMEText(body, "plain"))

    # PDF attachment
    attachment = MIMEBase("application", "pdf")
    attachment.set_payload(pdf_bytes)
    encoders.encode_base64(attachment)
    attachment.add_header(
        "Content-Disposition",
        f'attachment; filename="NeuroWAF_Report_{date_str}.pdf"',
    )
    msg.attach(attachment)

    # Send via Gmail SMTP
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, [recipient], msg.as_string())

    print(f"[Report] Email sent to {recipient}", flush=True)
