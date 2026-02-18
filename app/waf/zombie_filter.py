"""
Zombie-Request Filtering module.

Detects slow-rate and coordinated attack patterns:
  1. Stale/replayed requests  — same request repeated over a long window (10 min)
  2. Low-and-slow patterns    — machine-like regular timing (very low interval variance)
  3. Coordinated multi-IP     — many different IPs hitting the same path in a short burst

Follows the same pattern as rate_limiter.py:
  - check(req) -> Decision | None
  - Per-IP + global in-memory state with Lock
  - Periodic cleanup of stale entries
"""
from __future__ import annotations

import collections
import hashlib
import math
import time
from dataclasses import dataclass, field
from threading import Lock
from typing import Deque, Dict, Optional

from app.waf.decisions import Decision, Action
from app.waf.module_toggle import toggle_cache

MODULE_LABEL = "Zombie-Request Filtering"

# ── Thresholds ───────────────────────────────────────────────

# Check 1: Stale / replayed requests
STALE_WINDOW = 600.0          # 10-minute window
STALE_THRESHOLD = 20          # same request 20+ times in window

# Check 2: Low-and-slow pattern
SLOW_WINDOW = 120.0           # analyse last 2 minutes
SLOW_MIN_REQUESTS = 20        # need enough data points to judge
SLOW_REGULARITY_THRESHOLD = 0.15   # coefficient of variation (std/mean)
SLOW_MAX_MEAN_INTERVAL = 2.0       # faster than 1 req every 2s

# Check 3: Coordinated multi-IP
COORD_WINDOW = 30.0           # 30-second window
COORD_IP_THRESHOLD = 10       # 10+ unique IPs on same path

# Cleanup
STALE_ENTRY_AGE = 900.0       # evict IP entries not seen for 15 min
CLEANUP_INTERVAL = 120.0

# Paths that are commonly accessed by many users (skip coordination check)
COMMON_PATHS = frozenset({
    "/", "/index.html", "/favicon.ico", "/robots.txt", "/sitemap.xml",
})


@dataclass
class IPZombieState:
    fingerprint_times: Dict[str, Deque] = field(default_factory=dict)
    request_timeline: collections.deque = field(default_factory=collections.deque)
    last_seen: float = 0.0


class ZombieFilter:
    def __init__(self) -> None:
        self._ip_state: Dict[str, IPZombieState] = {}
        self._path_ips: Dict[str, collections.deque] = {}  # global, not per-IP
        self._lock = Lock()
        self._last_cleanup: float = time.monotonic()

    # ── Helpers ───────────────────────────────────────────────

    def _maybe_cleanup(self, now: float) -> None:
        if now - self._last_cleanup < CLEANUP_INTERVAL:
            return
        # Clean per-IP state
        cutoff = now - STALE_ENTRY_AGE
        stale = [ip for ip, s in self._ip_state.items() if s.last_seen < cutoff]
        for ip in stale:
            del self._ip_state[ip]
        # Clean global path tracker
        path_cutoff = now - COORD_WINDOW * 2
        stale_paths = [
            p for p, dq in self._path_ips.items()
            if not dq or dq[0][0] < path_cutoff
        ]
        for p in stale_paths:
            del self._path_ips[p]
        self._last_cleanup = now

    # ── Main entry point ─────────────────────────────────────

    def check(self, req) -> Optional[Decision]:
        if not toggle_cache.is_active(MODULE_LABEL):
            return None

        if not req.client_ip:
            return None

        now = time.monotonic()
        ua = req.user_agent or ""
        fingerprint = hashlib.md5(
            f"{req.method}|{req.raw_target_wire}|{req.body_text}|{ua}".encode()
        ).hexdigest()

        with self._lock:
            self._maybe_cleanup(now)

            # ── Per-IP state ─────────────────────────────────
            state = self._ip_state.get(req.client_ip)
            if not state:
                state = IPZombieState(last_seen=now)
                self._ip_state[req.client_ip] = state
            state.last_seen = now

            # 1. Stale / replayed requests
            fp_deque = state.fingerprint_times.get(fingerprint)
            if fp_deque is None:
                fp_deque = collections.deque()
                state.fingerprint_times[fingerprint] = fp_deque
            fp_deque.append(now)
            while fp_deque and fp_deque[0] < now - STALE_WINDOW:
                fp_deque.popleft()
            if len(fp_deque) >= STALE_THRESHOLD:
                return Decision(
                    Action.BLOCK,
                    [f"zombie:stale_replay:{len(fp_deque)}_in_{STALE_WINDOW:.0f}s"],
                    status_code=403,
                )

            # 2. Low-and-slow pattern
            state.request_timeline.append(now)
            while state.request_timeline and state.request_timeline[0] < now - SLOW_WINDOW:
                state.request_timeline.popleft()

            timeline_len = len(state.request_timeline)
            if timeline_len >= SLOW_MIN_REQUESTS:
                timestamps = list(state.request_timeline)
                intervals = [
                    timestamps[i + 1] - timestamps[i]
                    for i in range(len(timestamps) - 1)
                ]
                mean_iv = sum(intervals) / len(intervals)
                if 0 < mean_iv < SLOW_MAX_MEAN_INTERVAL:
                    variance = sum((iv - mean_iv) ** 2 for iv in intervals) / len(intervals)
                    std_iv = math.sqrt(variance)
                    cv = std_iv / mean_iv
                    if cv < SLOW_REGULARITY_THRESHOLD:
                        return Decision(
                            Action.BLOCK,
                            [f"zombie:low_and_slow:cv={cv:.3f}_mean={mean_iv:.2f}s"],
                            status_code=403,
                        )

            # ── Global coordination check ────────────────────
            # 3. Many different IPs hitting the same uncommon path
            path = req.normalized_path
            if path not in COMMON_PATHS:
                path_deque = self._path_ips.get(path)
                if path_deque is None:
                    path_deque = collections.deque()
                    self._path_ips[path] = path_deque
                path_deque.append((now, req.client_ip))
                while path_deque and path_deque[0][0] < now - COORD_WINDOW:
                    path_deque.popleft()
                unique_ips = len({ip for _, ip in path_deque})
                if unique_ips >= COORD_IP_THRESHOLD:
                    return Decision(
                        Action.BLOCK,
                        [f"zombie:coordinated:{unique_ips}_ips_on_{path}_in_{COORD_WINDOW:.0f}s"],
                        status_code=403,
                    )

        return None
