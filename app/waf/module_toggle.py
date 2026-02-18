"""
Lightweight cached reader for DDoS module toggle states.
Reads from MySQL at most once every REFRESH_INTERVAL seconds
so the WAF engine doesn't hit the DB on every request.
"""
from __future__ import annotations

import time
import threading
from typing import Dict

from app.models.ddos_model import DdosModel


class ModuleToggleCache:
    REFRESH_INTERVAL = 5.0  # seconds between DB reads

    def __init__(self) -> None:
        self._cache: Dict[str, bool] = {}
        self._last_refresh: float = 0.0
        self._lock = threading.Lock()

    def _refresh_if_stale(self) -> None:
        now = time.monotonic()
        if now - self._last_refresh < self.REFRESH_INTERVAL:
            return

        with self._lock:
            # Double-check after acquiring lock
            if time.monotonic() - self._last_refresh < self.REFRESH_INTERVAL:
                return
            try:
                settings = DdosModel.get_settings()
                modules = settings.get("modules") or []
                self._cache = {
                    m["label"]: bool(m.get("active", False))
                    for m in modules
                    if isinstance(m, dict) and "label" in m
                }
                # Also cache the global is_active flag
                self._cache["__global__"] = bool(settings.get("is_active", True))
            except Exception:
                pass  # keep stale cache on DB error
            self._last_refresh = time.monotonic()

    def is_active(self, module_label: str) -> bool:
        """Check if a specific module is active. Returns False if unknown."""
        self._refresh_if_stale()
        if not self._cache.get("__global__", True):
            return False
        return self._cache.get(module_label, False)


# Singleton — imported by bot_detection.py and zombie_filter.py
toggle_cache = ModuleToggleCache()
