# app/services/traffic_analysis_service.py
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Tuple

from app.models.logs_model import LogsModel
from app.services.geoip_service import GeoIPService


def _parse_ts(ts: str) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def _is_enforcement(action: str) -> bool:
    # Treat anything not "allow" as enforcement
    if not action:
        return False
    return action.lower() != "allow"


class TrafficAnalysisService:
    @staticmethod
    def build(range: str) -> Dict[str, Any]:
        events = LogsModel.fetch_raw_logs_window(range=range, limit=20000 if range == "7d" else 8000)

        now = datetime.now(timezone.utc)

        # Summary
        total_requests = len(events)
        latencies = [e.get("latency_ms") for e in events if isinstance(e.get("latency_ms"), (int, float))]
        avg_latency = (sum(latencies) / len(latencies)) if latencies else None

        rate_limited = 0
        enforcement_actions = 0
        ai_flagged = 0

        # Bucket format
        if (range or "").lower().strip() == "7d":
            def bucket_key(dt: datetime) -> str:
                return dt.strftime("%m-%d")
        else:
            def bucket_key(dt: datetime) -> str:
                return dt.strftime("%H:00")

        buckets: Dict[str, Dict[str, int]] = {}
        threat_counts: Dict[str, int] = {}
        ip_counts: Dict[str, int] = {}

        for e in events:
            dec = e.get("decision") or {}
            action = (dec.get("action") or "").lower()

            if action == "rate_limit":
                rate_limited += 1
            if _is_enforcement(action):
                enforcement_actions += 1

            ai = e.get("ai") or {}
            if ai.get("flagged") is True:
                ai_flagged += 1

            ts = _parse_ts(e.get("ts"))
            if not ts:
                continue

            k = bucket_key(ts)
            if k not in buckets:
                buckets[k] = {"total": 0, "enforced": 0}
            buckets[k]["total"] += 1
            if _is_enforcement(action):
                buckets[k]["enforced"] += 1

            # Use attack_type if present; else derive from decision.reasons[0] prefix; else action
            attack_type = e.get("attack_type")
            if not attack_type:
                reasons = (dec.get("reasons") or [])
                if reasons and isinstance(reasons, list) and isinstance(reasons[0], str) and ":" in reasons[0]:
                    attack_type = reasons[0].split(":", 1)[0]
                else:
                    attack_type = action or "unknown"

            threat_counts[str(attack_type)] = threat_counts.get(str(attack_type), 0) + 1

            ip = e.get("client_ip")
            if ip:
                ip_counts[str(ip)] = ip_counts.get(str(ip), 0) + 1

        # Sort timeseries
        def sort_key_time_label(lbl: str) -> Tuple[int, int]:
            try:
                hh = int(lbl.split(":")[0])
                return (0, hh)
            except Exception:
                return (1, 999)

        if (range or "").lower().strip() == "7d":
            timeseries = [{"time": k, **v} for k, v in sorted(buckets.items(), key=lambda kv: kv[0])]
        else:
            timeseries = [{"time": k, **v} for k, v in sorted(buckets.items(), key=lambda kv: sort_key_time_label(kv[0]))]

        top_threats = sorted(threat_counts.items(), key=lambda kv: kv[1], reverse=True)[:8]
        threat_radar = [{"subject": name, "value": count} for name, count in top_threats]

        # Geo
        geoip = GeoIPService()
        geoip_enabled = geoip.is_enabled()

        top_ips = sorted(ip_counts.items(), key=lambda kv: kv[1], reverse=True)[:200]
        country_counts: Dict[str, Dict[str, Any]] = {}
        for ip, cnt in top_ips:
            country_name, flag = geoip.lookup_country(ip)
            key = country_name or "Unknown"
            if key not in country_counts:
                country_counts[key] = {"country": key, "flag": flag, "count": 0}
            country_counts[key]["count"] += cnt

        geo = sorted(country_counts.values(), key=lambda x: x["count"], reverse=True)

        return {
            "range": range,
            "window": {"end_utc": now.isoformat()},
            "summary": {
                "total_requests": total_requests,
                "avg_latency_ms": avg_latency,
                "enforcement_actions": enforcement_actions,
                "rate_limited": rate_limited,
                "ai_flagged": ai_flagged,
            },
            "timeseries": timeseries,
            "threat_radar": threat_radar,
            "geo": geo,
            "geoip_enabled": geoip_enabled,
        }
