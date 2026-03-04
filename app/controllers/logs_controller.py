# app/controllers/logs_controller.py
from __future__ import annotations

import json
from typing import Any, Dict, Optional
from datetime import datetime, timedelta, timezone

from app.models.logs_model import LogsModel

class LogsController:
    @staticmethod
    def _preset_to_since(preset: str) -> Optional[datetime]:
        now = datetime.now(timezone.utc)
        preset = (preset or "").lower()

        if preset == "5m":
            return now - timedelta(minutes=5)
        if preset == "1h":
            return now - timedelta(hours=1)
        if preset == "24h":
            return now - timedelta(hours=24)
        if preset == "7d":
            return now - timedelta(days=7)
        if preset == "all":
            return None
        return now - timedelta(hours=24)

    @staticmethod
    def _to_display_row(log_id: int, raw):
        if isinstance(raw, (str, bytes, bytearray)):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = {}

        if not isinstance(raw, dict):
            raw = {}

        decision = raw.get("decision") or {}
        reasons = decision.get("reasons") or []
        client_data = raw.get("client") or {}
        dest_data = raw.get("destination") or {}

        attack_type = "None"
        if reasons:
            picked = None
            for r in reasons:
                s = str(r)
                head = s.split(":")[0] if ":" in s else s
                if head == "baseline_allow":
                    continue
                picked = head
                break
            
            if picked is None:
                s0 = str(reasons[0])
                head0 = s0.split(":")[0] if ":" in s0 else s0
                picked = head0
            
            attack_type = picked

        action_raw = (decision.get("effective_action") or decision.get("action") or "allow").lower()
        if action_raw == "block":
            action_taken = "BLOCKED"
        elif action_raw == "flag":
            action_taken = "FLAGGED"
        else:
            action_taken = "ALLOWED"

        source_ip = client_data.get("ip") or raw.get("client_ip") or "127.0.0.1"
        country = client_data.get("country") or "Local"
        flag = client_data.get("flag") or "🏠"
        geo_location = f"{flag} {country}"

        http_method = (raw.get("method") or "—").upper()
        
        request_path = (
            raw.get("raw_target_wire")
            or raw.get("normalized_path")
            or raw.get("decoded_path")
            or "/"
        )

        destination_ip = dest_data.get("target") or raw.get("destination_ip") or "WAF"

        request_params = raw.get("query") or ""
        if not request_params and isinstance(raw.get("raw_target_wire"), str):
            raw_wire = raw.get("raw_target_wire")
            qidx = raw_wire.find("?")
            if qidx != -1 and qidx < len(raw_wire) - 1:
                request_params = raw_wire[qidx + 1 :]
        
        if not request_params:
            request_params = "—"

        return {
            "id": log_id,
            "request_id": raw.get("request_id"),
            "timestamp": raw.get("ts"),
            "source_ip": source_ip,
            "destination_ip": destination_ip,
            "geo_location": geo_location,
            "http_method": http_method,
            "request_params": request_params,
            "request_path": request_path,
            "attack_type": attack_type,
            "action_taken": action_taken,
            "raw_log": raw,
        }

    @staticmethod
    def get_logs(
        search: str,
        limit: int,
        page: int,
        time_mode: str,
        time_preset: str,
        start_date: Optional[str],
        end_date: Optional[str],
        cursor_id: Optional[int] = None,
        attack_type_filter: Optional[str] = None,
        action_filter: Optional[str] = None,
        country_filter: Optional[str] = None,
        method_filter: Optional[str] = None,
        ip_filter: Optional[str] = None,
    ) -> Dict[str, Any]:
        since_utc: Optional[datetime] = None
        until_utc: Optional[datetime] = None

        live_cursor_id: Optional[int] = None
        if time_mode == "preset":
            if time_preset == "live":
                live_cursor_id = cursor_id
            else:
                since_utc = LogsController._preset_to_since(time_preset)

        elif time_mode == "after" and start_date:
            since_utc = LogsModel.parse_datetime_to_utc(start_date)

        elif time_mode == "before" and end_date:
            until_utc = LogsModel.parse_datetime_to_utc(end_date)

        elif time_mode == "between" and start_date and end_date:
            since_utc = LogsModel.parse_datetime_to_utc(start_date)
            until_utc = LogsModel.parse_datetime_to_utc(end_date)

        # PASS EVERYTHING TO THE DATABASE!
        rows, total = LogsModel.fetch_logs(
            search=search,
            since_utc=since_utc,
            until_utc=until_utc,
            limit=limit,
            page=page,
            cursor_id=live_cursor_id,
            is_live=(time_mode == "preset" and time_preset == "live"),
            attack_type_filter=attack_type_filter,
            action_filter=action_filter,
            country_filter=country_filter,
            method_filter=method_filter,
            ip_filter=ip_filter,
        )

        logs = [LogsController._to_display_row(r["log_id"], r["raw_log"]) for r in rows]
        
        # Calculate pagination safely using the actual Database total count
        total_pages = max(1, (total + limit - 1) // limit)

        return {
            "logs": logs,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
            },
        }
    
    @staticmethod
    def get_filter_options() -> Dict[str, list]:
        return LogsModel.fetch_filter_options()