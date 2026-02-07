from __future__ import annotations
import logging
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List, Tuple
from fastapi import APIRouter, Response, Request, HTTPException, Query
from pydantic import BaseModel, Field
from pathlib import Path
from typing import List, Literal, Optional
from urllib.parse import urljoin, urlparse

from app.services.runtime_config import get_active_waf_config

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
from app.controllers.overview_controller import OverviewController

from app.db.db_bootstrap import (
    ensure_database_and_schema,
    DBAuthError,
    DBConnectionError,
    DBSchemaError,
    DBInitError,
)

router = APIRouter()
logger = logging.getLogger(__name__)
AI_STATE_FILE = Path("app/ai_models/retrain_state.json")

class LoginRequest(BaseModel):
    username: str
    password: str

class SetupWAFRequest(BaseModel):
    target_host: str
    proxy_port: int
    waf_mode: Literal["shadow", "protect"] = "protect"
    login_endpoint: str | None = None
    excluded_endpoints: str | None = None
    username: str
    password: str
    login_payload: Optional[Dict[str, Any]] = None

class GenerateBaselineRequest(BaseModel):
    target_host: str

    login_endpoint: Optional[str] = None
    excluded_endpoints: Optional[List[str]] = None 

    login_payload: Optional[Dict[str, str]] = None

class SetupDBRequest(BaseModel):
    host: str
    port: int = 3306
    user: str
    password: str = ""
    database: str = "NeuroWAF_db"
    schema_file: Optional[str] = "schema.sql"

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

@router.post("/setupdb")
def setupdb(payload: SetupDBRequest):
    schema_path = Path("app/db") / (payload.schema_file or "schema.sql")

    try:
        ensure_database_and_schema(
            host=payload.host,
            port=payload.port,
            user=payload.user,
            password=payload.password,
            database=payload.database,
            schema_path=schema_path,
        )
        return {"status": "ok"}

    except DBAuthError:
        raise HTTPException(
            status_code=400,
            detail="Database authentication failed. Please check database username and password."
        )
    except DBConnectionError:
        raise HTTPException(
            status_code=400,
            detail="Unable to connect to the database server. Please verify host and port."
        )
    except DBSchemaError:
        raise HTTPException(
            status_code=400,
            detail="Database schema setup failed. Please check your schema.sql file."
        )
    except DBInitError as e:
        logger.exception("DB init error")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/generate_baseline")
def generate_baseline(payload: GenerateBaselineRequest, request: Request):
    raw = (payload.target_host or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="target_host is required")

    # Build origin_url (same logic you already use)
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

    auth_info = None
    if payload.login_endpoint and payload.login_payload:
        auth_info = {
            "login_endpoint": payload.login_endpoint,
            "login_payload": payload.login_payload,
        }

    crawler = AuthenticatedCrawler(
        origin_url=origin_url,
        auth_info=auth_info,
        excluded_endpoints=payload.excluded_endpoints,  # ✅ LIST
    )

    ok = crawler.crawl()
    if auth_info is not None and not ok:
        raise HTTPException(status_code=401, detail="Baseline generation failed: invalid crawler credentials")

    train_hybrid_main()
    anomaly_ai = getattr(request.app.state, "anomaly_ai_scorer", None)
    if anomaly_ai and hasattr(anomaly_ai, "load"):
        anomaly_ai.load()

    return {"status": "ok", "baseline_count": len(crawler.visited)}

@router.post("/setupwaf")
def setupwaf(payload: SetupWAFRequest, request: Request):
    """
    Creates / updates WAF instance only.
    No crawling, no AI training here.
    """

    raw = (payload.target_host or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="target_host is required")

    # Validate target_host format early
    if raw.startswith(("http://", "https://")):
        p = urlparse(raw)
        if not p.hostname:
            raise HTTPException(status_code=400, detail="Invalid target_host URL")
    else:
        if ":" in raw:
            host_part, port_str = raw.rsplit(":", 1)
            if not port_str.isdigit():
                raise HTTPException(status_code=400, detail="Invalid port in target_host")

    # 1) Persist WAF configuration
    setup_waf_controller(payload)

    # 2) Refresh runtime WAF config
    request.app.state.waf_config = get_active_waf_config()

    return {
        "status": "ok",
        "message": "WAF instance created successfully"
    }
    
@router.get("/logs")
def get_logs(
    search: str = "",
    limit: int = 20,
    page: int = 1,
    time_mode: str = "preset",
    time_preset: str = "24h",
    start_date: str | None = None,
    end_date: str | None = None,
):
    return LogsController.get_logs(
        search=search,
        limit=limit,
        page=page,
        time_mode=time_mode,
        time_preset=time_preset,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/policy/entries")
def list_policy_entries(list_type: Optional[str] = None):
    return PolicyController.list_rules(list_type)

@router.post("/policy/entries")
def create_policy_entry(payload: PolicyRuleCreate):
    return PolicyController.create_rule(payload.model_dump())

@router.delete("/policy/entries/{rule_id}")
def delete_policy_entry(rule_id: int):
    return PolicyController.delete_rule(rule_id)

@router.get("/get-overview")
def overview(
    range: str = Query("24h", pattern="^(24h|7d)$"),
    recent_limit: int = Query(50, ge=1, le=200),
):
    """
    Used by Overview.jsx:
      GET /api/get-overview?range=24h&recent_limit=50
    """

    # Fetch overview data
    data = OverviewController.get_overview(range=range, recent_limit=recent_limit)

    # Load AI training stats from file
    ai_stats = {
        "baseline_count": 0, 
        "last_trained_count": 0,
        "last_trained_at": None
    }
    
    if AI_STATE_FILE.exists():
        try:
            content = AI_STATE_FILE.read_text(encoding="utf-8")
            if content.strip():
                ai_stats = json.loads(content)
        except Exception as e:
            logger.error(f"Error reading AI state file: {e}")

    # Inject into response
    if isinstance(data, dict):
        data["ai_training_stats"] = ai_stats

    print(data)

    return data

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