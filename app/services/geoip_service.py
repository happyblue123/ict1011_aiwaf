# app/services/geoip_service.py
from __future__ import annotations

import ipaddress
from typing import Dict, Tuple

import requests


def _flag_from_iso2(iso2: str | None) -> str:
    if not iso2 or len(iso2) != 2:
        return "🏳️"
    return chr(0x1F1E6 + (ord(iso2[0].upper()) - ord("A"))) + \
           chr(0x1F1E6 + (ord(iso2[1].upper()) - ord("A")))


class GeoIPService:
    """
    Online GeoIP via ip-api.com (no API key).
    NOTE: ip-api free endpoint is HTTP (not HTTPS) and rate-limited.
    """

    def __init__(self):
        self._cache: Dict[str, Tuple[str, str]] = {}

    def is_enabled(self) -> bool:
        return True

    def lookup_country(self, ip: str) -> Tuple[str, str]:
        # Fast path: cache
        cached = self._cache.get(ip)
        if cached:
            return cached

        # Local/private/non-public IPs
        try:
            addr = ipaddress.ip_address(ip)
            if (
                addr.is_private
                or addr.is_loopback
                or addr.is_link_local
                or addr.is_reserved
                or addr.is_multicast
            ):
                result = ("Local/Private", "🏠")
                self._cache[ip] = result
                return result
        except Exception:
            result = ("Unknown", "🏳️")
            self._cache[ip] = result
            return result

        # Online lookup
        try:
            r = requests.get(f"http://ip-api.com/json/{ip}", timeout=2)
            if r.status_code != 200:
                result = ("Unknown", "🏳️")
                self._cache[ip] = result
                return result

            data = r.json()
            if data.get("status") != "success":
                result = ("Unknown", "🏳️")
                self._cache[ip] = result
                return result

            country = data.get("country") or "Unknown"
            iso2 = data.get("countryCode")
            result = (country, _flag_from_iso2(iso2))
            self._cache[ip] = result
            return result

        except Exception:
            result = ("Unknown", "🏳️")
            self._cache[ip] = result
            return result
