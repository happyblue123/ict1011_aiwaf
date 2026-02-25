# app/ai_models/retrain_manager.py
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict

BASE_DIR = Path(__file__).resolve().parent  # app/ai_models
STATE_FILE = BASE_DIR / "retrain_state.json"
LOCK_FILE = BASE_DIR / "retrain.lock"

THRESHOLD = 500  # set back to 1000 later

# ── Classification retrain constants ─────────────────────────────
CLS_STATE_FILE = BASE_DIR / "cls_retrain_state.json"
CLS_LOCK_FILE  = BASE_DIR / "cls_retrain.lock"
CLS_THRESHOLD  = 10  # human-verified labels are high quality; training is fast


def _load_state() -> Dict[str, Any]:
    if not STATE_FILE.exists():
        return {"baseline_count": 0, "last_trained_count": 0, "last_trained_at": None}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"baseline_count": 0, "last_trained_count": 0, "last_trained_at": None}


def _save_state(state: Dict[str, Any]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2), encoding="utf-8")
    tmp.replace(STATE_FILE)


def increment_baseline_counter(n: int = 1) -> int:
    state = _load_state()
    state["baseline_count"] = int(state.get("baseline_count") or 0) + int(n)
    _save_state(state)
    # print(f"[AI] baseline_count={state['baseline_count']}", flush=True)
    return int(state["baseline_count"])


def _acquire_lock() -> bool:
    try:
        LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(str(LOCK_FILE), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
        return True
    except FileExistsError:
        return False


def _release_lock() -> None:
    try:
        LOCK_FILE.unlink(missing_ok=True)
    except Exception:
        pass


def _mark_trained() -> None:
    state = _load_state()
    state["last_trained_count"] = int(state.get("baseline_count") or 0)
    state["last_trained_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    _save_state(state)


def _reload_model(app) -> None:
    # ✅ use YOUR real scorer import path
    from app.waf.ai_model import AIAnomalyScorer

    scorer = AIAnomalyScorer()
    scorer.load()
    app.state.anomaly_ai_scorer = scorer


def _train_worker(app) -> None:
    print("[AI] Retrain worker started", flush=True)

    if not _acquire_lock():
        print("[AI] Retrain worker exit: lock already held", flush=True)
        return

    try:
        print("[AI] Lock acquired, training begins...", flush=True)

        # ✅ make sure this import path is correct in your project
        from app.services.train_hybrid_ai import main as train_main

        train_main()

        print("[AI] Training finished, marking + reloading model", flush=True)
        _mark_trained()
        _reload_model(app)

        print("[AI] Retrain worker done", flush=True)

    except Exception as e:
        print("[AI] Retrain worker error:", repr(e), flush=True)
    finally:
        _release_lock()


def trigger_retrain_async(app) -> None:
    state = _load_state()
    bc = int(state.get("baseline_count") or 0)
    lt = int(state.get("last_trained_count") or 0)
    diff = bc - lt

    # print(f"[AI] trigger called bc={bc} lt={lt} diff={diff} thr={THRESHOLD}", flush=True)

    if diff < THRESHOLD:
        return

    if LOCK_FILE.exists():
        print("[AI] not retraining: lock exists", flush=True)
        return

    print("[AI] starting retrain thread...", flush=True)
    t = threading.Thread(target=_train_worker, args=(app,), daemon=True)
    t.start()


# ══════════════════════════════════════════════════════════════════
# Classification retrain pipeline (mirrors anomaly pipeline above)
# ══════════════════════════════════════════════════════════════════

def _load_cls_state() -> Dict[str, Any]:
    if not CLS_STATE_FILE.exists():
        return {"feedback_count": 0, "last_trained_count": 0, "last_trained_at": None}
    try:
        return json.loads(CLS_STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"feedback_count": 0, "last_trained_count": 0, "last_trained_at": None}


def _save_cls_state(state: Dict[str, Any]) -> None:
    CLS_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = CLS_STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2), encoding="utf-8")
    tmp.replace(CLS_STATE_FILE)


def increment_cls_feedback_counter(n: int = 1) -> int:
    state = _load_cls_state()
    state["feedback_count"] = int(state.get("feedback_count") or 0) + int(n)
    _save_cls_state(state)
    return int(state["feedback_count"])


def _acquire_cls_lock() -> bool:
    try:
        CLS_LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(str(CLS_LOCK_FILE), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
        return True
    except FileExistsError:
        return False


def _release_cls_lock() -> None:
    try:
        CLS_LOCK_FILE.unlink(missing_ok=True)
    except Exception:
        pass


def _mark_cls_trained() -> None:
    state = _load_cls_state()
    state["last_trained_count"] = int(state.get("feedback_count") or 0)
    state["last_trained_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    _save_cls_state(state)


def _reload_cls_model(app) -> None:
    from app.waf.ai_model import AIRequestClassifier

    classifier = AIRequestClassifier()
    classifier.load()
    app.state.classification_ai = classifier


def _cls_train_worker(app) -> None:
    print("[AI-CLS] Classification retrain worker started", flush=True)

    if not _acquire_cls_lock():
        print("[AI-CLS] Retrain worker exit: lock already held", flush=True)
        return

    try:
        print("[AI-CLS] Lock acquired, training begins...", flush=True)

        from app.services.train_classification_ai import train_classification_model
        train_classification_model()

        print("[AI-CLS] Training finished, marking + reloading model", flush=True)
        _mark_cls_trained()
        _reload_cls_model(app)

        print("[AI-CLS] Classification retrain worker done", flush=True)

    except Exception as e:
        print("[AI-CLS] Classification retrain worker error:", repr(e), flush=True)
    finally:
        _release_cls_lock()


def trigger_cls_retrain_async(app) -> None:
    state = _load_cls_state()
    fc = int(state.get("feedback_count") or 0)
    lt = int(state.get("last_trained_count") or 0)
    diff = fc - lt

    if diff < CLS_THRESHOLD:
        return

    if CLS_LOCK_FILE.exists():
        print("[AI-CLS] not retraining: lock exists", flush=True)
        return

    print("[AI-CLS] starting classification retrain thread...", flush=True)
    t = threading.Thread(target=_cls_train_worker, args=(app,), daemon=True)
    t.start()
