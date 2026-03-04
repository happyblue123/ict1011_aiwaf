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
        # 1. Parse raw_log if it's a JSON string from the database
        if isinstance(raw, (str, bytes, bytearray)):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = {}

        if not isinstance(raw, dict):
            raw = {}

        # 2. Extract nested objects for easier access
        decision = raw.get("decision") or {}
        reasons = decision.get("reasons") or []
        client_data = raw.get("client") or {}
        dest_data = raw.get("destination") or {}

        # ---- attack type logic ----
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

        # ---- action taken (Mapping to UI constants) ----
        action_raw = (decision.get("effective_action") or decision.get("action") or "allow").lower()
        if action_raw == "block":
            action_taken = "BLOCKED"
        elif action_raw == "flag":
            action_taken = "FLAGGED"
        else:
            action_taken = "ALLOWED"

        # ---- source & geo logic (Fixing the "Unknown" issue) ----
        source_ip = client_data.get("ip") or raw.get("client_ip") or "127.0.0.1"
        country = client_data.get("country") or "Local"
        flag = client_data.get("flag") or "🏠"
        geo_location = f"{flag} {country}"

        # ---- method & path ----
        http_method = (raw.get("method") or "—").upper()
        
        # Logic to find the path (preferring wire path for full visibility)
        request_path = (
            raw.get("raw_target_wire")
            or raw.get("normalized_path")
            or raw.get("decoded_path")
            or "/"
        )

        # ---- destination ----
        destination_ip = dest_data.get("target") or raw.get("destination_ip") or "WAF"

        # ---- request params (querystring) ----
        request_params = raw.get("query") or ""
        if not request_params and isinstance(raw.get("raw_target_wire"), str):
            raw_wire = raw.get("raw_target_wire")
            qidx = raw_wire.find("?")
            if qidx != -1 and qidx < len(raw_wire) - 1:
                request_params = raw_wire[qidx + 1 :]
        
        if not request_params:
            request_params = "—"

        # 3. Return the flattened dictionary the Frontend expects
        return {
            "id": log_id,
            "request_id": raw.get("request_id"), # Useful for React keys
            "timestamp": raw.get("ts"),
            "source_ip": source_ip,
            "destination_ip": destination_ip,
            "geo_location": geo_location,
            "http_method": http_method,
            "request_params": request_params,
            "request_path": request_path,
            "attack_type": attack_type,
            "action_taken": action_taken,
            "raw_log": raw, # Keep the full object for the "Inspect" Eye icon
        }

    @staticmethod
    def _apply_search_filters(log: Dict[str, Any], search: str) -> bool:
        """
        Apply client-side search/filter logic to a single log entry.
        Supports multiple filter formats:
        - 'ip:192.168.1.1' - filter by source IP
        - 'attack:sql_injection' - filter by attack type
        - 'action:BLOCKED' - filter by action taken
        - 'method:POST' - filter by HTTP method
        - 'country:Russia' - filter by country
        - Free text search in path, params, IP, attack type
        """
        if not search or not search.strip():
            return True
        
        search = search.strip().lower()
        
        # Structured filters
        if search.startswith("ip:"):
            ip = search[3:].strip()
            return ip.lower() in log.get("source_ip", "").lower()
        
        if search.startswith("attack:"):
            attack = search[7:].strip()
            return attack.lower() in log.get("attack_type", "").lower()
        
        if search.startswith("action:"):
            action = search[7:].strip()
            return action.lower() in log.get("action_taken", "").lower()
        
        if search.startswith("method:"):
            method = search[7:].strip()
            return method.upper() == log.get("http_method", "").upper()
        
        if search.startswith("country:"):
            country = search[8:].strip()
            geo_location = log.get("geo_location", "").lower()
            return country.lower() in geo_location
        
        # Free text search across multiple fields
        searchable_fields = [
            log.get("source_ip", ""),
            log.get("request_path", ""),
            log.get("request_params", ""),
            log.get("attack_type", ""),
            log.get("action_taken", ""),
            log.get("geo_location", ""),
        ]
        
        return any(search in field.lower() for field in searchable_fields if field)

    @staticmethod
    def filter_logs(
        logs: list,
        search: str,
        attack_type_filter: Optional[str] = None,
        action_filter: Optional[str] = None,
        country_filter: Optional[str] = None,
        method_filter: Optional[str] = None,
        ip_filter: Optional[str] = None,
    ) -> list:
        """
        Apply multiple filters to logs.
        Returns filtered list of logs.
        """
        filtered = logs
        
        # Apply search
        if search and search.strip():
            filtered = [log for log in filtered if LogsController._apply_search_filters(log, search)]
        
        # Apply attack type filter
        if attack_type_filter and attack_type_filter.lower() != "all":
            filtered = [log for log in filtered if log.get("attack_type", "") == attack_type_filter]
        
        # Apply action filter
        if action_filter and action_filter.lower() != "all":
            filtered = [log for log in filtered if log.get("action_taken", "") == action_filter]
        
        # Apply country filter
        if country_filter and country_filter.lower() != "all":
            filtered = [log for log in filtered if country_filter.lower() in log.get("geo_location", "").lower()]
        
        # Apply HTTP method filter
        if method_filter and method_filter.lower() != "all":
            filtered = [log for log in filtered if log.get("http_method", "").upper() == method_filter.upper()]
        
        # Apply IP filter
        if ip_filter and ip_filter.strip():
            filtered = [log for log in filtered if ip_filter.lower() in log.get("source_ip", "").lower()]
        
        return filtered

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

        rows, total = LogsModel.fetch_logs(
            search=search,
            since_utc=since_utc,
            until_utc=until_utc,
            limit=limit,
            page=page,
            cursor_id=live_cursor_id,
            is_live=(time_mode == "preset" and time_preset == "live"),
        )

        logs = [LogsController._to_display_row(r["log_id"], r["raw_log"]) for r in rows]
        
        # Apply additional filters
        logs = LogsController.filter_logs(
            logs,
            search=search,
            attack_type_filter=attack_type_filter,
            action_filter=action_filter,
            country_filter=country_filter,
            method_filter=method_filter,
            ip_filter=ip_filter,
        )
        
        total_pages = max(1, (total + limit - 1) // limit)

        return {
            "logs": logs,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": len(logs),
                "total_pages": max(1, (len(logs) + limit - 1) // limit),
            },
        }
