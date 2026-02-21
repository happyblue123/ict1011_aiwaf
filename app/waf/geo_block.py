"""
Geo-blocking module for the WAF engine.
Blocks requests from high-risk countries when the geo_blocking
toggle is enabled in waf_settings.

Uses a cached read from MySQL (refreshes every 5 seconds)
to avoid hitting the DB on every request.
"""
from __future__ import annotations

import time
import threading
from typing import Optional

from app.waf.decisions import Decision, Action
from app.db.db_config import get_conn


# Countries commonly blocked by enterprise WAFs.
# ISO-3166 alpha-2 codes.
BLOCKED_COUNTRIES = {"RU", "CN", "KP", "IR"}


class _GeoBlockToggleCache:
    """Reads waf_settings.geo_blocking from MySQL with 5-second cache."""

    REFRESH_INTERVAL = 5.0

    def __init__(self) -> None:
        self._enabled: bool = True
        self._last_refresh: float = 0.0
        self._lock = threading.Lock()

    def _refresh_if_stale(self) -> None:
        now = time.monotonic()
        if now - self._last_refresh < self.REFRESH_INTERVAL:
            return
        with self._lock:
            if time.monotonic() - self._last_refresh < self.REFRESH_INTERVAL:
                return
            try:
                conn = get_conn()
                with conn.cursor() as cur:
                    cur.execute("SELECT geo_blocking FROM waf_settings WHERE id = 1")
                    row = cur.fetchone()
                    if row:
                        self._enabled = bool(row["geo_blocking"])
                conn.close()
            except Exception:
                pass  # keep stale value on DB error
            self._last_refresh = time.monotonic()

    @property
    def enabled(self) -> bool:
        self._refresh_if_stale()
        return self._enabled


_toggle = _GeoBlockToggleCache()


class GeoBlocker:
    """
    Checks if the request IP belongs to a blocked country.
    Requires a GeoIPService instance for lookups.
    """

    def check(self, client_ip: str | None, geoip_service) -> Optional[Decision]:
        if not _toggle.enabled:
            return None

        if not client_ip or not geoip_service:
            return None

        country_code = geoip_service.lookup_country_code(client_ip)

        # Skip unknown / local IPs
        if not country_code:
            return None

        if country_code in BLOCKED_COUNTRIES:
            country_name, _ = geoip_service.lookup_country(client_ip)
            return Decision(
                Action.BLOCK,
                [f"geo_block:{country_name}"],
                status_code=403,
            )

        return None
