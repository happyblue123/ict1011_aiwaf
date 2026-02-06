from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.models.ddos_model import DdosModel
from app.services.geoip_service import GeoIPService


class DdosController:
    BASELINE_FILE = Path("app/ai_models/data/ai_requests.jsonl")
    GEOIP = GeoIPService()

    @staticmethod
    def _parse_iso_ts(ts: Optional[str]) -> Optional[datetime]:
        if not ts:
            return None
        s = str(ts).strip()
        if not s:
            return None
        # handle trailing Z if present
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except Exception:
            return None

    @staticmethod
    def _bucket_key(dt: datetime) -> str:
        return dt.replace(minute=0, second=0, microsecond=0).isoformat()

    @staticmethod
    def _build_hour_buckets(hours: int) -> List[datetime]:
        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        return [now - timedelta(hours=i) for i in range(hours - 1, -1, -1)]

    @staticmethod
    def _read_baseline_counts(hours: int) -> Dict[str, int]:
        buckets = {DdosController._bucket_key(dt): 0 for dt in DdosController._build_hour_buckets(hours)}
        if not DdosController.BASELINE_FILE.exists():
            return buckets

        total = 0
        min_ts = None
        max_ts = None

        with DdosController.BASELINE_FILE.open("r", encoding="utf-8") as f:
            for line in f:
                try:
                    row = json.loads(line)
                    ts = row.get("ts")
                    if ts is None:
                        continue
                    dt = datetime.fromtimestamp(float(ts), tz=timezone.utc)
                except Exception:
                    continue

                total += 1
                min_ts = dt if min_ts is None else min(min_ts, dt)
                max_ts = dt if max_ts is None else max(max_ts, dt)

                key = DdosController._bucket_key(dt)
                if key in buckets:
                    buckets[key] += 1

        # If nothing in last window, fall back to overall avg per hour
        if total > 0 and all(v == 0 for v in buckets.values()) and min_ts and max_ts:
            span_hours = max(int((max_ts - min_ts).total_seconds() // 3600), 1)
            avg_per_hour = total / span_hours
            for k in buckets:
                buckets[k] = int(avg_per_hour)

        return buckets

    @staticmethod
    def _read_live_counts(hours: int) -> Dict[str, Dict[str, int]]:
        buckets = {DdosController._bucket_key(dt): {"total": 0, "blocked": 0} for dt in DdosController._build_hour_buckets(hours)}
        since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

        rows = DdosModel.fetch_raw_logs_since(since_iso=since)
        for row in rows:
            raw = row.get("raw_log")
            if isinstance(raw, (str, bytes, bytearray)):
                try:
                    raw = json.loads(raw)
                except Exception:
                    raw = {}

            if not isinstance(raw, dict):
                continue

            dt = DdosController._parse_iso_ts(raw.get("ts"))
            if not dt:
                continue

            key = DdosController._bucket_key(dt)
            if key not in buckets:
                continue

            buckets[key]["total"] += 1
            decision = raw.get("decision") or {}
            action = (decision.get("effective_action") or decision.get("action") or "").lower()
            if action == "block":
                buckets[key]["blocked"] += 1

        return buckets

    @staticmethod
    def _top_attackers(hours: int, limit: int = 10) -> List[Dict[str, Any]]:
        since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        rows = DdosModel.fetch_raw_logs_since(since_iso=since)

        stats: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            raw = row.get("raw_log")
            if isinstance(raw, (str, bytes, bytearray)):
                try:
                    raw = json.loads(raw)
                except Exception:
                    raw = {}

            if not isinstance(raw, dict):
                continue

            ip = raw.get("client_ip") or "unknown"
            entry = stats.setdefault(ip, {"count": 0, "blocked": 0, "score": 0.0, "geo": None})
            entry["count"] += 1

            decision = raw.get("decision") or {}
            action = (decision.get("effective_action") or decision.get("action") or "").lower()
            if action == "block":
                entry["blocked"] += 1

            reasons = decision.get("reasons") or []
            for reason in reasons:
                if isinstance(reason, str) and reason.startswith("AI_ANOMALY:"):
                    try:
                        score = float(reason.split(":", 1)[1])
                        entry["score"] = max(entry["score"], score)
                    except Exception:
                        pass

            if not entry["geo"]:
                entry["geo"] = raw.get("geo_location")

        window_seconds = hours * 3600
        rows_out = []
        for ip, entry in stats.items():
            if entry.get("geo"):
                region = entry.get("geo")
            else:
                country, flag = DdosController.GEOIP.lookup_country(ip)
                region = f"{country} {flag}".strip()
            rows_out.append({
                "ip": ip,
                "score": round(float(entry["score"]), 3),
                "rps": round(entry["count"] / window_seconds, 3),
                "region": region,
                "action": "BLOCKED" if entry["blocked"] > 0 else "OBSERVED",
            })

        rows_out.sort(key=lambda r: (r["score"], r["rps"]), reverse=True)
        return rows_out[:limit]

    @staticmethod
    def get_overview(hours: int = 24) -> Dict[str, Any]:
        settings = DdosModel.get_settings()

        live = DdosController._read_live_counts(hours)
        baseline = DdosController._read_baseline_counts(hours)

        traffic = []
        for dt in DdosController._build_hour_buckets(hours):
            key = DdosController._bucket_key(dt)
            live_counts = live.get(key, {"total": 0, "blocked": 0})
            base_count = baseline.get(key, 0)

            traffic.append({
                "time": dt.strftime("%H:00"),
                "currentRPS": round(live_counts["total"] / 3600, 3),
                "baselineRPS": round(base_count / 3600, 3),
                "dropped": round(live_counts["blocked"] / 3600, 3),
            })

        attackers = DdosController._top_attackers(hours=hours, limit=10)

        return {
            "status": {
                "is_active": settings["is_active"],
                "mode": settings["mode"],
                "modules": settings["modules"],
            },
            "traffic": traffic,
            "top_attackers": attackers,
        }

    @staticmethod
    def get_settings() -> Dict[str, Any]:
        return DdosModel.get_settings()

    @staticmethod
    def update_settings(payload: Dict[str, Any]) -> Dict[str, Any]:
        return DdosModel.update_settings(
            is_active=payload.get("is_active"),
            mode=payload.get("mode"),
            modules=payload.get("modules"),
        )