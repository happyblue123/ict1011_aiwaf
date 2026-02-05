from app.waf.decisions import Decision, Action
from app.waf.rules.protocol import protocol_checks
from app.waf.rules.traversal import traversal_checks
from app.waf.rules.sqli import sqli_checks
from app.waf.rules.xss import xss_checks
from app.waf.rules.command_injection import command_injection_checks
from app.waf.rules.generic_injection import generic_injection_checks
from app.waf.rate_limiter import RateLimiter
from app.waf.rules.ip_policy import apply_ip_policy

class WAFEngine:
    def __init__(self) -> None:
        self.rate_limiter = RateLimiter()

    def evaluate(self, req) -> Decision:
        # 1️⃣ IP allow/block FIRST (hard override)
        ip_decision = apply_ip_policy(req.client_ip)
        if ip_decision:
            return ip_decision

        # 2️⃣ Stateless rule checks (signatures / protocol / injections)
        for check in (
            protocol_checks,
            traversal_checks,
            sqli_checks,
            xss_checks,
            command_injection_checks,
            generic_injection_checks,
        ):
            hit = check(req)
            if hit:
                return hit

        # 3️⃣ Stateful rate limiting LAST
        hit = self.rate_limiter.check(req.client_ip, req.normalized_path)
        if hit:
            return hit

        # 4️⃣ Default allow
        return Decision(Action.ALLOW, ["baseline_allow"])
