import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from db import init_db
from routes.assets import router as assets_router
from routes.projects import router as projects_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Cheat Sheet Maker API")

# CORS: allow WEB_ORIGIN and common localhost variants for dev
_cors_origins = [settings.WEB_ORIGIN]
if settings.ENV == "dev":
    for origin in ["http://localhost:3000", "http://127.0.0.1:3000"]:
        if origin not in _cors_origins:
            _cors_origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router)
app.include_router(assets_router)


@app.on_event("startup")
def startup():
    """Create upload/output dirs, init DB; log settings."""
    for dir_path in [settings.UPLOAD_DIR, settings.OUTPUT_DIR]:
        p = Path(dir_path)
        p.mkdir(parents=True, exist_ok=True)
        logger.info("Ensured directory exists: %s", p.resolve())

    init_db()
    logger.info("Database initialized at %s", settings.DB_PATH)

    logger.info(
        "Startup settings: env=%s, web_origin=%s, upload_dir=%s, output_dir=%s, max_upload_mb=%s",
        settings.ENV,
        settings.WEB_ORIGIN,
        settings.UPLOAD_DIR,
        settings.OUTPUT_DIR,
        settings.MAX_UPLOAD_MB,
    )


@app.get("/health")
def health():
    return {"ok": True, "env": settings.ENV}
