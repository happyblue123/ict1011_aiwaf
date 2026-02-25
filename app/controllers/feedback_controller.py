from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.models.feedback_model import FeedbackModel
from app.waf.ai_dataset import (
    append_request_row as append_baseline,
    append_attack_row,
    append_classification_benign,
    append_classification_malicious,
)
from app.ai_models.retrain_manager import (
    increment_baseline_counter,
    trigger_retrain_async,
    increment_cls_feedback_counter,
    trigger_cls_retrain_async,
)


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

        # 4. Inject into anomaly + classification pipelines based on feedback
        injected = False
        cls_injected = False
        raw_log = log_row["raw_log"]
        ai_data = raw_log.get("ai") or {}
        features = ai_data.get("features")
        classification_text = ai_data.get("classification_text")

        if label == "false_positive":
            # Anomaly pipeline: inject as baseline
            if features and isinstance(features, dict):
                append_baseline(features)
                increment_baseline_counter(1)
                trigger_retrain_async(app)
                injected = True

            # Classification pipeline: inject as benign
            if classification_text:
                append_classification_benign(classification_text)
                increment_cls_feedback_counter(1)
                trigger_cls_retrain_async(app)
                cls_injected = True

        elif label == "false_negative":
            # Anomaly pipeline: inject as attack
            if features and isinstance(features, dict):
                append_attack_row(features)
                increment_baseline_counter(1)
                trigger_retrain_async(app)
                injected = True

            # Classification pipeline: inject as malicious
            if classification_text:
                append_classification_malicious(classification_text)
                increment_cls_feedback_counter(1)
                trigger_cls_retrain_async(app)
                cls_injected = True

        return {
            "feedback_id": feedback_id,
            "log_id": log_id,
            "label": label,
            "injected_to_baseline": injected,
            "injected_to_classification": cls_injected,
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
