from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.models.feedback_model import FeedbackModel
from app.waf.ai_dataset import append_request_row as append_baseline
from app.ai_models.retrain_manager import increment_baseline_counter, trigger_retrain_async


class FeedbackController:

    @staticmethod
    def submit(user_id: int, log_id: int, label: str, app, notes: Optional[str] = None) -> Dict[str, Any]:
        # 1. Verify log exists
        log_row = FeedbackModel.get_log_by_id(log_id)
        if not log_row:
            return {"error": "Log not found", "status": 404}

        # 2. Check for duplicate feedback
        existing = FeedbackModel.get_by_log_id(log_id)
        if existing:
            return {"error": "Feedback already submitted for this log", "status": 409}

        # 3. Insert feedback
        feedback_id = FeedbackModel.insert(log_id, user_id, label, notes)

        # 4. If false_positive: inject features back into baseline for retraining
        injected = False
        if label == "false_positive":
            raw_log = log_row["raw_log"]
            ai_data = raw_log.get("ai") or {}
            features = ai_data.get("features")

            if features and isinstance(features, dict):
                append_baseline(features)
                increment_baseline_counter(1)
                trigger_retrain_async(app)
                injected = True

        return {
            "feedback_id": feedback_id,
            "log_id": log_id,
            "label": label,
            "injected_to_baseline": injected,
        }

    @staticmethod
    def get_feedback(log_id: int) -> Optional[Dict[str, Any]]:
        return FeedbackModel.get_by_log_id(log_id)

    @staticmethod
    def get_stats() -> Dict[str, Any]:
        return FeedbackModel.get_stats()

    @staticmethod
    def batch_status(log_ids: List[int]) -> Dict[int, str]:
        return FeedbackModel.batch_check(log_ids)
