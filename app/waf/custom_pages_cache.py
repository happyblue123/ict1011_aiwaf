"""
Cached reader for custom response page settings from waf_settings.
Refreshes every 5 seconds to avoid hitting the DB on every request.
"""
from __future__ import annotations

import time
import threading

from app.db.db_config import get_conn


class _CustomPagesCache:
    REFRESH_INTERVAL = 5.0

    def __init__(self) -> None:
        self._error_enabled: bool = False
        self._error_html: str = ""
        self._bot_enabled: bool = False
        self._bot_html: str = ""
        self._custom_404_enabled: bool = False
        self._custom_404_html: str = ""
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
                    cur.execute(
                        "SELECT error_enabled, error_html, bot_enabled, bot_html, custom_404_enabled, custom_404_html "
                        "FROM waf_settings WHERE id = 1"
                    )
                    row = cur.fetchone()
                    if row:
                        self._error_enabled = bool(row["error_enabled"])
                        self._error_html = row["error_html"] or ""
                        self._bot_enabled = bool(row["bot_enabled"])
                        self._bot_html = row["bot_html"] or ""
                        self._custom_404_enabled = bool(row.get("custom_404_enabled", False))
                        self._custom_404_html = row.get("custom_404_html", "") or ""
                conn.close()
            except Exception:
                pass  # keep stale values on DB error
            self._last_refresh = time.monotonic()

    @property
    def error_enabled(self) -> bool:
        self._refresh_if_stale()
        return self._error_enabled

    @property
    def error_html(self) -> str:
        self._refresh_if_stale()
        return self._error_html

    @property
    def bot_enabled(self) -> bool:
        self._refresh_if_stale()
        return self._bot_enabled

    @property
    def bot_html(self) -> str:
        self._refresh_if_stale()
        return self._bot_html

    @property
    def custom_404_enabled(self) -> bool:
        self._refresh_if_stale()
        return self._custom_404_enabled

    @property
    def custom_404_html(self) -> str:
        self._refresh_if_stale()
        return self._custom_404_html


custom_pages = _CustomPagesCache()
