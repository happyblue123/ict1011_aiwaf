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
        # Before inserting, ensure there isn't already an active rule for this
        # IP.  We guard against two problematic cases:
        #   * duplicate entries on the same list (whitelist/blacklist)
        #   * the IP already exists on the opposite list (cannot be both)
        #
        # `get_policy_for_ip` returns the highest‑priority active rule (whitelist
        # takes precedence), or None if no non-expired rule exists.
        existing = PolicyModel.get_policy_for_ip(payload.get("ip_address"))
        if existing:
            if existing.get("list_type") == payload.get("list_type"):
                # same list – already present
                from fastapi import HTTPException

                raise HTTPException(
                    status_code=400,
                    detail=f"IP {payload.get('ip_address')} is already added to the {existing.get('list_type')}.",
                )
            else:
                # conflict between whitelist/blacklist
                from fastapi import HTTPException

                raise HTTPException(
                    status_code=400,
                    detail=f"IP {payload.get('ip_address')} is already on the {existing.get('list_type')} and cannot be added to the {payload.get('list_type')}.",
                )

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
