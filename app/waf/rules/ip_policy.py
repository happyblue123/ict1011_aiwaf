# app/waf/rules/ip_policy.py
from __future__ import annotations

from typing import Optional

from app.models.policy_model import PolicyModel
from app.waf.decisions import Decision, Action  # adjust import to your actual paths


def apply_ip_policy(client_ip: str) -> Optional[Decision]:
    """
    Returns a Decision if IP matches a policy (whitelist/blacklist).
    Returns None if no policy applies.
    """
    if not client_ip:
        return None

    policy_match = PolicyModel.get_policy_for_ip(client_ip)
    if not policy_match:
        return None

    list_type = (policy_match.get("list_type") or "").lower()
    reason = policy_match.get("reason") or "manual"

    if list_type == "whitelist":
        return Decision(Action.ALLOW, [f"IP_ALLOWLIST:{reason}"])

    # default: treat anything else as blocklist
    return Decision(Action.BLOCK, [f"IP_BLOCKLIST:{reason}"])
