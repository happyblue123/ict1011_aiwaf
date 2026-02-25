import json, time
from pathlib import Path

DATA_DIR = Path("app/ai_models/data")
DATA_DIR.mkdir(exist_ok=True)
AI_FILE = DATA_DIR / "ai_requests.jsonl"

def append_request_row(features: dict) -> None:
    row = {"ts": time.time(), "label": "baseline", "features": features}
    with AI_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")

def append_attack_row(features: dict) -> None:
    """Append features labelled as 'attack' so training excludes them from the baseline."""
    row = {"ts": time.time(), "label": "attack", "features": features}
    with AI_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")

# ── Classification feedback data ─────────────────────────────────
CLASSIFICATION_FEEDBACK_FILE = DATA_DIR / "classification_feedback.jsonl"

def append_classification_benign(request_text: str) -> None:
    """Analyst marked a classification block as false positive (benign)."""
    row = {"ts": time.time(), "label": 0, "text": request_text}
    with CLASSIFICATION_FEEDBACK_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")

def append_classification_malicious(request_text: str) -> None:
    """Analyst marked a missed request as false negative (malicious)."""
    row = {"ts": time.time(), "label": 1, "text": request_text}
    with CLASSIFICATION_FEEDBACK_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")
