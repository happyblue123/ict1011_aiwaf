from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.controllers.proxy_controller import router as proxy_router
from app.api.routes import router  # dashboard API routes

from app.services.proxy_service import ProxyService
from app.services.logging_service import LoggingService
from app.waf.ai_model import AIAnomalyScorer, AIRequestClassifier

from app.services.runtime_config import get_active_waf_config
from app.services.geoip_service import GeoIPService


app = FastAPI(title="AIWAF Proxy (V1)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
app.include_router(proxy_router)

proxy_service = ProxyService()
logging_service = LoggingService()

app.state.proxy_service = proxy_service
app.state.logging_service = logging_service
app.state.waf_config = None  # ✅ will be loaded on startup
app.state.anomaly_ai_scorer = None


@app.on_event("startup")
async def on_startup():
    print("🚀 Starting AIWAF Proxy & Dashboard API...")

    # ✅ Load active WAF config from DB (ok if not configured yet)
    try:
        app.state.waf_config = get_active_waf_config()
    except Exception:
        app.state.waf_config = None


    # Load AI model
    anomaly_ai = AIAnomalyScorer()
    anomaly_ai.load()
    app.state.anomaly_ai_scorer = anomaly_ai

    classification_ai = AIRequestClassifier()
    classification_ai.load()
    app.state.classification_ai = classification_ai

    # GeoIP service
    geoip_service = GeoIPService()
    app.state.geoip_service = geoip_service

    # Start proxy service
    await proxy_service.startup()


@app.on_event("shutdown")
async def on_shutdown():
    await proxy_service.shutdown()
