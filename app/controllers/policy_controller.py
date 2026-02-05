from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from app.models.policy_model import PolicyModel


class PolicyController:
    @staticmethod
    def list_rules(list_type: Optional[str]) -> Dict[str, Any]:
        rules = PolicyModel.fetch_rules(list_type=list_type)
        return {"entries": rules}

    @staticmethod
    def create_rule(payload: Dict[str, Any]) -> Dict[str, Any]:
        expires_at = payload.get("expires_at")
        if isinstance(expires_at, str) and expires_at:
            expires_at = datetime.fromisoformat(expires_at)
        elif not expires_at:
            expires_at = None

        rule = PolicyModel.create_rule(
            list_type=payload["list_type"],
            ip_address=payload["ip_address"],
            reason=payload.get("reason"),
            created_by=payload.get("created_by"),
            expires_at=expires_at,
        )
        return {"entry": rule}

    @staticmethod
    def delete_rule(rule_id: int) -> Dict[str, Any]:
        deleted = PolicyModel.delete_rule(rule_id)
        return {"deleted": deleted}
