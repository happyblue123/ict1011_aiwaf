from __future__ import annotations
import html
import re
from dataclasses import dataclass
from typing import Dict, Optional, List
from urllib.parse import unquote_plus

_HEX_RE = re.compile(r"%[0-9a-fA-F]{2}")

def normalize_body_text(value: str, *, max_rounds: int = 2) -> str:
    """
    Normalize body text for detection (NOT for forwarding):
    - URL-decode a limited number of times (safe_unquote)
    - HTML entity decode
    - keep it deterministic and safe (no parsing/eval)
    """
    if not value:
        return ""

    out = value

    # Only attempt URL decoding if it likely contains percent-encoding or pluses
    if "%" in out or "+" in out or _HEX_RE.search(out):
        out = safe_unquote(out, max_rounds=max_rounds)

    # Decode HTML entities (&lt;script&gt;)
    try:
        out = html.unescape(out)
    except Exception:
        pass

    return out

def safe_unquote(value: str, max_rounds: int = 2) -> str:
    """
    Decode URL encoding safely a limited number of times.
    Prevents multi-decode bypass tricks.
    """
    out = value
    for _ in range(max_rounds):
        new = unquote_plus(out)
        if new == out:
            break
        out = new
    return out


def normalize_path(path: str) -> str:
    """
    Normalize path:
    - ensure leading /
    - collapse // into /
    - remove /./
    - resolve /../ (dot-segment removal)
    """
    if not path.startswith("/"):
        path = "/" + path

    while "//" in path:
        path = path.replace("//", "/")

    parts: List[str] = []
    for seg in path.split("/"):
        if seg == "" or seg == ".":
            continue
        if seg == "..":
            if parts:
                parts.pop()
            continue
        parts.append(seg)

    return "/" + "/".join(parts)


@dataclass
class NormalizedRequest:
    method: str
    raw_target_wire: str
    decoded_path: str
    normalized_path: str
    query: str
    headers: Dict[str, str]
    client_ip: Optional[str]
    user_agent: str
    body_len: int
    body_text: str
