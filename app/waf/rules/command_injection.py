from __future__ import annotations
import re
from app.waf.decisions import Decision, Action

# Conservative command injection detection (query only)
# We REQUIRE:
#   - a chaining/operator indicator   AND
#   - a suspicious command / execution primitive
#
# This avoids blocking innocent strings like "a&b" in normal text.

CHAIN_RE = re.compile(r"(?:;|\|\||&&|\||\n|\r)")
EXEC_PRIMITIVE_RE = re.compile(r"(?:\$\(|`[^`]{1,200}`)")  # $(...) or `...`

# Common OS commands often used in injection payloads
# (Keep this list conservative for V1)
COMMAND_WORD_RE = re.compile(
    r"\b(?:"
    # Linux
    r"cat|ls|pwd|whoami|id|uname|"
    r"rm|cp|mv|chmod|chown|kill|ps|env|export|printenv|"
    r"ifconfig|iptables|passwd|crontab|"
    r"scp|ssh|telnet|nmap|dd|tar|zip|"
    r"head|tail|grep|awk|sed|sort|tee|"
    # Windows
    r"dir|type|net|tasklist|taskkill|systeminfo|"
    r"reg|wmic|sc|echo|ping|nslookup|more|copy|del|rmdir|mkdir|"
    r"rename|move|find|findstr|"
    # Network / download
    r"curl|wget|nc|netcat|"
    # Interpreters
    r"bash|sh|powershell|cmd|"
    r"python|perl|php|ruby|ipconfig"
    r")\b",
    re.IGNORECASE,
)


def command_injection_checks(req) -> Decision | None:
    query = (req.query or "")
    body  = (req.body_text or "")

    # Nothing to inspect
    if not query and not body:
        return None

    def check_text(text: str, where: str) -> Decision | None:
        if not text:
            return None

        has_chain = CHAIN_RE.search(text) is not None
        has_exec  = EXEC_PRIMITIVE_RE.search(text) is not None
        has_cmd   = COMMAND_WORD_RE.search(text) is not None

        # Require "chain + (cmd OR exec primitive)" to reduce false positives
        if has_chain and (has_cmd or has_exec):
            return Decision(
                Action.BLOCK,
                [f"cmd_injection:{where}:chain+cmd_or_exec"],
                status_code=403,
            )

        # Also block if exec primitive exists even without chain (high confidence)
        if has_exec:
            return Decision(
                Action.BLOCK,
                [f"cmd_injection:{where}:exec_primitive"],
                status_code=403,
            )

        return None

    # Prefer query match label if it triggers, then body
    d = check_text(query, "query")
    if d:
        return d

    return check_text(body, "body")

