"""
Behavioral Bot Detection module.

Detects automated tools and bot-like behavior via:
  1. Missing / empty User-Agent
  2. Known attack tool User-Agent (sqlmap, nikto, etc.)
  3. Missing typical browser headers (Accept, Accept-Language, Accept-Encoding)
  4. Rapid path scanning (many unique paths in a short window)
  5. Identical repeated requests (same fingerprint many times)

Follows the same pattern as rate_limiter.py:
  - check(req) -> Decision | None
  - Per-IP in-memory state with Lock
  - Periodic cleanup of stale entries
"""
from __future__ import annotations

import collections
import hashlib
import re
import time
from dataclasses import dataclass, field
from threading import Lock
from typing import Dict, Optional

from app.waf.decisions import Decision, Action
from app.waf.module_toggle import toggle_cache

MODULE_LABEL = "Behavioral Bot Detection"

# ── Thresholds ───────────────────────────────────────────────
MIN_UA_LENGTH = 10

PATH_WINDOW = 10.0            # seconds
PATH_SCAN_THRESHOLD = 25      # unique paths in window

REPEAT_WINDOW = 30.0          # seconds
REPEAT_THRESHOLD = 15         # identical requests in window

STALE_ENTRY_AGE = 300.0       # evict IP entries not seen for 5 min
CLEANUP_INTERVAL = 60.0

# ── Known attack tool signatures ─────────────────────────────
KNOWN_BOT_AGENTS = re.compile(
    r"(?:sqlmap|nikto|gobuster|dirbuster|nmap|masscan|zgrab|"
    r"wfuzz|ffuf|hydra|medusa|burpsuite|nessus|openvas|"
    r"acunetix|appscan|havij|w3af|arachni|skipfish)",
    re.IGNORECASE,
)

# Real browsers always send at least some of these
BROWSER_HEADER_SET = frozenset({"accept", "accept-language", "accept-encoding"})


@dataclass
class IPBehavior:
    path_log: collections.deque = field(default_factory=collections.deque)
    repeat_log: collections.deque = field(default_factory=collections.deque)
    last_seen: float = 0.0


class BotDetector:
    def __init__(self) -> None:
        self._state: Dict[str, IPBehavior] = {}
        self._lock = Lock()
        self._last_cleanup: float = time.monotonic()

    # ── Helpers ───────────────────────────────────────────────

    def _get_behavior(self, ip: str, now: float) -> IPBehavior:
        beh = self._state.get(ip)
        if not beh:
            beh = IPBehavior(last_seen=now)
            self._state[ip] = beh
        beh.last_seen = now
        return beh

    def _maybe_cleanup(self, now: float) -> None:
        if now - self._last_cleanup < CLEANUP_INTERVAL:
            return
        cutoff = now - STALE_ENTRY_AGE
        stale = [ip for ip, b in self._state.items() if b.last_seen < cutoff]
        for ip in stale:
            del self._state[ip]
        self._last_cleanup = now

    # ── Main entry point ─────────────────────────────────────

    def check(self, req) -> Optional[Decision]:
        if not toggle_cache.is_active(MODULE_LABEL):
            return None

        # ─── Stateless checks (no per-IP state) ─────────────

        # 1. Missing / empty User-Agent
        ua = (req.user_agent or "").strip()
        if not ua:
            return Decision(Action.BLOCK, ["bot:missing_user_agent"], status_code=403)

        if len(ua) < MIN_UA_LENGTH:
            return Decision(Action.BLOCK, [f"bot:short_ua:{len(ua)}_chars"], status_code=403)

        # 2. Known attack tool
        m = KNOWN_BOT_AGENTS.search(ua)
        if m:
            return Decision(Action.BLOCK, [f"bot:known_tool:{m.group().lower()}"], status_code=403)

        # 3. Missing browser headers
        lower_keys = {k.lower() for k in req.headers}
        if not (BROWSER_HEADER_SET & lower_keys):
            return Decision(Action.BLOCK, ["bot:missing_browser_headers"], status_code=403)

        # ─── Stateful checks (per-IP tracking) ──────────────

        if not req.client_ip:
            return None

        now = time.monotonic()

        with self._lock:
            self._maybe_cleanup(now)
            beh = self._get_behavior(req.client_ip, now)

            # 4. Rapid path scanning
            beh.path_log.append((now, req.normalized_path))
            while beh.path_log and beh.path_log[0][0] < now - PATH_WINDOW:
                beh.path_log.popleft()
            unique_paths = len({p for _, p in beh.path_log})
            if unique_paths >= PATH_SCAN_THRESHOLD:
                return Decision(
                    Action.BLOCK,
                    [f"bot:path_scan:{unique_paths}_unique_in_{PATH_WINDOW:.0f}s"],
                    status_code=403,
                )

            # 5. Identical repeated requests
            fingerprint = hashlib.md5(
                f"{req.method}|{req.raw_target_wire}|{req.body_text}|{ua}".encode()
            ).hexdigest()
            beh.repeat_log.append((now, fingerprint))
            while beh.repeat_log and beh.repeat_log[0][0] < now - REPEAT_WINDOW:
                beh.repeat_log.popleft()
            repeat_count = sum(1 for _, fp in beh.repeat_log if fp == fingerprint)
            if repeat_count >= REPEAT_THRESHOLD:
                return Decision(
                    Action.BLOCK,
                    [f"bot:identical_repeat:{repeat_count}_in_{REPEAT_WINDOW:.0f}s"],
                    status_code=403,
                )

        return None
