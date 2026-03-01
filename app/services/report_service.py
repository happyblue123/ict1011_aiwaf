"""
PDF report generator for NeuroWAF automated security reports.
Uses fpdf2 to build a landscape PDF matching the frontend export style.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from collections import Counter
from typing import Any, Dict, List

from fpdf import FPDF

from app.models.logs_model import LogsModel
from app.models.feedback_model import FeedbackModel


# AI retrain state file paths
_AI_DIR = Path(__file__).resolve().parent.parent / "ai_models"
_ANOMALY_STATE = _AI_DIR / "retrain_state.json"
_CLS_STATE = _AI_DIR / "cls_retrain_state.json"


def _load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def _parse_log(raw) -> dict:
    """Normalise a raw_log value (may be dict or JSON str)."""
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except Exception:
        return {}


def generate_report_pdf(period: str = "24h") -> bytes:
    """
    Build a full NeuroWAF Security Report as PDF bytes.
    period: "24h" | "7d" | "30d"
    """

    # ── 1. Gather data ──────────────────────────────────────
    range_map = {"24h": "24h", "7d": "7d", "30d": "7d"}  # fetch_raw_logs_window only supports 24h/7d
    raw_logs = LogsModel.fetch_raw_logs_window(range=range_map.get(period, "24h"), limit=20000)

    logs: List[dict] = []
    for entry in raw_logs:
        obj = _parse_log(entry.get("raw_log", entry) if isinstance(entry, dict) else entry)
        logs.append(obj)

    feedback_stats = FeedbackModel.get_stats()
    anomaly_state = _load_json(_ANOMALY_STATE)
    cls_state = _load_json(_CLS_STATE)

    # ── 2. Aggregate stats ──────────────────────────────────
    total_events = len(logs)
    blocked = [l for l in logs if (l.get("decision") or {}).get("action") == "BLOCK"]
    total_blocked = len(blocked)
    total_anomalies = sum(1 for l in logs if (l.get("ai") or {}).get("flagged"))
    total_cls_blocked = sum(1 for l in logs if (l.get("ai") or {}).get("classification_blocked"))

    # Attack type breakdown
    attack_counts: Counter = Counter()
    for l in logs:
        reasons = (l.get("decision") or {}).get("reasons") or []
        if not reasons or (l.get("decision") or {}).get("action") == "ALLOW":
            attack_counts["Clean Traffic"] += 1
        else:
            for r in reasons:
                tag = r.split(":")[0] if ":" in r else r
                attack_counts[tag] += 1

    # Top attacker IPs
    ip_counts: Counter = Counter()
    for l in blocked:
        ip = (l.get("client") or {}).get("ip", "unknown")
        ip_counts[ip] += 1
    top_ips = ip_counts.most_common(10)

    # ── 3. Build PDF ────────────────────────────────────────
    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    period_label = {"24h": "Last 24 Hours", "7d": "Last 7 Days", "30d": "Last 30 Days"}.get(period, period)

    # Title
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(30, 58, 138)
    pdf.cell(0, 12, "NeuroWAF Security Report", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 6, f"Generated: {now_str}  |  Period: {period_label}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # ── Executive Summary ───────────────────────────────────
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 8, "Executive Summary", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 11)
    summary_items = [
        f"Total Events Processed: {total_events}",
        f"Threats Blocked: {total_blocked}",
        f"AI Anomalies Detected: {total_anomalies}",
        f"AI Classification Blocks: {total_cls_blocked}",
        f"Block Rate: {(total_blocked / total_events * 100):.1f}%" if total_events else "Block Rate: 0%",
    ]
    for item in summary_items:
        pdf.cell(0, 6, f"  -  {item}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # ── Attack Breakdown Table ──────────────────────────────
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, "Attack Breakdown", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(30, 58, 138)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(100, 7, "Attack Type", border=1, fill=True)
    pdf.cell(40, 7, "Count", border=1, fill=True, align="C")
    pdf.cell(40, 7, "% of Total", border=1, fill=True, align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(0, 0, 0)
    fill = False
    for attack_type, count in attack_counts.most_common(15):
        if fill:
            pdf.set_fill_color(249, 250, 251)
        pct = f"{count / total_events * 100:.1f}%" if total_events else "0%"
        pdf.cell(100, 6, attack_type, border=1, fill=fill)
        pdf.cell(40, 6, str(count), border=1, fill=fill, align="C")
        pdf.cell(40, 6, pct, border=1, fill=fill, align="C", new_x="LMARGIN", new_y="NEXT")
        fill = not fill
    pdf.ln(4)

    # ── Top 10 Attacker IPs ─────────────────────────────────
    if top_ips:
        pdf.set_font("Helvetica", "B", 14)
        pdf.cell(0, 8, "Top 10 Attacker IPs", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(30, 58, 138)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(80, 7, "IP Address", border=1, fill=True)
        pdf.cell(40, 7, "Blocked Requests", border=1, fill=True, align="C", new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(0, 0, 0)
        fill = False
        for ip, cnt in top_ips:
            if fill:
                pdf.set_fill_color(249, 250, 251)
            pdf.cell(80, 6, ip, border=1, fill=fill)
            pdf.cell(40, 6, str(cnt), border=1, fill=fill, align="C", new_x="LMARGIN", new_y="NEXT")
            fill = not fill
        pdf.ln(4)

    # ── AI Model Status ─────────────────────────────────────
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 8, "AI Model Status", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 11)
    anomaly_trained = anomaly_state.get("last_trained_at", "Never")
    anomaly_count = anomaly_state.get("baseline_count", 0)
    cls_trained = cls_state.get("last_trained_at", "Never")
    cls_count = cls_state.get("feedback_count", 0)

    ai_items = [
        f"Anomaly Model - Last trained: {anomaly_trained}  |  Baseline samples: {anomaly_count}",
        f"Classification Model - Last trained: {cls_trained}  |  Feedback samples: {cls_count}",
    ]
    for item in ai_items:
        pdf.cell(0, 6, f"  -  {item}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # ── Analyst Feedback Summary ────────────────────────────
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, "Analyst Feedback Summary", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 11)
    fb_items = [
        f"Total Reviews: {feedback_stats['total']}",
        f"Correct Detections: {feedback_stats['correct_count']}",
        f"False Positives: {feedback_stats['false_positive_count']}",
        f"False Negatives: {feedback_stats['false_negative_count']}",
        f"AI Precision: {feedback_stats['precision_pct']}%",
    ]
    for item in fb_items:
        pdf.cell(0, 6, f"  -  {item}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # ── Detailed Events Table ───────────────────────────────
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, "Event Details (Latest 200)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    col_widths = [38, 28, 55, 45, 25, 30, 22, 30]
    headers = ["Time", "IP", "Path", "Attack Type", "AI Score", "Classification", "Action", "Country"]

    def _render_row(pdf_obj, widths, values, height, is_header=False, fill=False):
        """Render a single table row."""
        for i, val in enumerate(widths):
            is_last = (i == len(widths) - 1)
            kwargs = {"border": 1, "fill": is_header or fill, "align": "C"}
            if is_last:
                kwargs["new_x"] = "LMARGIN"
                kwargs["new_y"] = "NEXT"
            pdf_obj.cell(widths[i], height, str(values[i]), **kwargs)

    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(30, 58, 138)
    pdf.set_text_color(255, 255, 255)
    _render_row(pdf, col_widths, headers, 7, is_header=True)

    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(0, 0, 0)

    display_logs = logs[:200]
    fill = False
    for l in display_logs:
        if fill:
            pdf.set_fill_color(249, 250, 251)
        else:
            pdf.set_fill_color(255, 255, 255)

        ts = l.get("ts", "")
        if ts:
            try:
                ts = datetime.fromisoformat(ts).strftime("%m/%d %H:%M:%S")
            except Exception:
                ts = str(ts)[:16]

        ip = (l.get("client") or {}).get("ip", "-")
        path_raw = l.get("raw_target_wire", l.get("decoded_path", "-"))
        path_str = path_raw[:30] + "..." if len(str(path_raw)) > 30 else str(path_raw)

        reasons = (l.get("decision") or {}).get("reasons") or []
        attack = reasons[0].split(":")[0] if reasons else "Clean"

        ai = l.get("ai") or {}
        score = f"{ai['score']:.3f}" if ai.get("score") is not None else "-"
        cls_score = ai.get("classification_score")
        cls_label = "-"
        if cls_score is not None:
            cls_label = "MALICIOUS" if ai.get("classification_blocked") else "BENIGN"

        action = (l.get("decision") or {}).get("action", "-")
        country_raw = (l.get("client") or {}).get("country", "-")
        # Strip emoji flags — fpdf2 Helvetica can't render them
        country = "".join(c for c in str(country_raw) if ord(c) < 0x10000 and c.isprintable()
                         ).strip() or "-"

        row_data = [ts, ip, path_str, attack, score, cls_label, action, country]
        _render_row(pdf, col_widths, row_data, 5, fill=fill)
        fill = not fill

    # ── Footer ──────────────────────────────────────────────
    pdf.ln(8)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, "This report was auto-generated by NeuroWAF AI Security Platform.", align="C")

    return pdf.output()
