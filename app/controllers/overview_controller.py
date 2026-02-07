from __future__ import annotations

from app.models.logs_model import LogsModel
from app.models.policy_model import PolicyModel


class OverviewController:
    @staticmethod
    def get_overview(
        range: str = "24h",
        recent_limit: int = 50,
    ) -> dict:
        """
        Build overview payload for Overview.jsx
        """

        raw_logs = LogsModel.fetch_raw_logs_window(
            range=range,
            limit=20000,
        )

        rules = PolicyModel.fetch_active_rules()
        rule_counts = PolicyModel.count_active_by_type()

        recent = LogsModel.fetch_latest_event_rows(
            limit=recent_limit
        )
        print(recent)

        return {
            "range": range,
            "recent_events": recent,
            "ip_policy_rules": rules,
            "ip_policy_counts": rule_counts,
        }
