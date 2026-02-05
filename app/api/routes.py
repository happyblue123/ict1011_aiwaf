from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List, Tuple
from fastapi import APIRouter, Response, Request, HTTPException, Query
from pydantic import BaseModel
from typing import List, Literal, Optional
from urllib.parse import urljoin, urlparse

from app.controllers.auth_controller import (
    login_controller,
    auth_check_controller,
    logout_controller,
)
from app.controllers.waf_controller import (
    setup_waf_controller
)
from app.controllers.logs_controller import LogsController

from app.services.crawler_for_any_website import AuthenticatedCrawler

from app.services.train_hybrid_ai import main as train_hybrid_main

from app.controllers.policy_controller import PolicyController

from app.services.traffic_analysis_service import TrafficAnalysisService

from app.controllers.ddos_controller import DdosController

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str

class SetupWAFRequest(BaseModel):
    target_host: str
    proxy_port: int
    login_endpoint: str | None = None
    excluded_endpoints: str | None = None
    username: str
    password: str
    login_payload: Optional[Dict[str, Any]] = None

class PolicyRuleCreate(BaseModel):
    list_type: Literal["whitelist", "blacklist"]
    ip_address: str
    reason: Optional[str] = None
    created_by: Optional[str] = None
    expires_at: Optional[str] = None

class DdosModule(BaseModel):
    label: str
    active: bool

class DdosSettingsUpdate(BaseModel):
    is_active: Optional[bool] = None
    mode: Optional[str] = None
    modules: Optional[List[DdosModule]] = None

@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response):
    return login_controller(payload.username, payload.password, response, request)

@router.get("/auth/check")
def auth_check(request: Request):
    return auth_check_controller(request)

@router.post("/logout")
def logout(request: Request, response: Response):
    return logout_controller(request, response)

@router.post("/setupwaf")
def setupwaf(payload: SetupWAFRequest, request: Request):

    # 1) Build origin_url from target_host
    raw = (payload.target_host or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="target_host is required")

    if raw.startswith(("http://", "https://")):
        p = urlparse(raw)
        if not p.hostname:
            raise HTTPException(status_code=400, detail="Invalid target_host URL")
        scheme = p.scheme or "http"
        host = p.hostname
        port = p.port or (443 if scheme == "https" else 80)
    else:
        scheme = "http"
        if ":" in raw:
            host_part, port_str = raw.rsplit(":", 1)
            if not port_str.isdigit():
                raise HTTPException(status_code=400, detail="Invalid port in target_host")
            host, port = host_part, int(port_str)
        else:
            host, port = raw, 80

    origin_url = f"{scheme}://{host}:{port}"

    # 2) Build auth_info (optional)
    auth_info = None
    if payload.login_endpoint and payload.login_payload:
        auth_info = {
            "login_endpoint": payload.login_endpoint,
            "login_payload": payload.login_payload,
        }

    # 3) Crawl first to validate credentials
    crawler = AuthenticatedCrawler(origin_url=origin_url, auth_info=auth_info)
    ok = crawler.crawl()

    if auth_info is not None and not ok:
        raise HTTPException(
            status_code=401,
            detail="Deployment failed: crawler credentials are incorrect."
        )

    # 4) Only if crawl succeeded: write WAF config to DB
    setup_waf_controller(payload)  # no need to return waf_id

    # 5) Train AI model + reload into app
    train_hybrid_main()
    anomaly_ai = getattr(request.app.state, "anomaly_ai_scorer", None)
    if anomaly_ai and hasattr(anomaly_ai, "load"):
        anomaly_ai.load()

    return {
        "status": "ok",
        "baseline_count": len(crawler.visited),
    }
    
@router.get("/logs")
def get_logs(
    search: str = "",
    attack_type: str = "All",
    limit: int = 20,
    page: int = 1,
    time_mode: str = "preset",
    time_preset: str = "24h",
    start_date: str | None = None,
    end_date: str | None = None,
):
    return LogsController.get_logs(
        search=search,
        attack_type=attack_type,
        limit=limit,
        page=page,
        time_mode=time_mode,
        time_preset=time_preset,
        start_date=start_date,
        end_date=end_date,
    )

@router.get("/filters")
def filters():
    return LogsController.get_attack_types()

@router.get("/policy/entries")
def list_policy_entries(list_type: Optional[str] = None):
    return PolicyController.list_rules(list_type)

@router.post("/policy/entries")
def create_policy_entry(payload: PolicyRuleCreate):
    return PolicyController.create_rule(payload.model_dump())

@router.delete("/policy/entries/{rule_id}")
def delete_policy_entry(rule_id: int):
    return PolicyController.delete_rule(rule_id)

@router.get("/overview")
def overview():
    return

@router.get("/traffic/analysis")
def traffic_analysis(
    range: str = Query(
        "24h",
        pattern="^(24h|7d)$",
        description="Time window for analysis"
    )
):
    """
    Returns aggregated traffic analytics for the WAF dashboard.
    """
    return TrafficAnalysisService.build(range)

@router.get("/ddos/overview")
def ddos_overview(hours: int = 24):
    return DdosController.get_overview(hours=hours)

@router.get("/ddos/settings")
def ddos_settings():
    return DdosController.get_settings()

@router.put("/ddos/settings")
def update_ddos_settings(payload: DdosSettingsUpdate):
    return DdosController.update_settings(payload.model_dump())