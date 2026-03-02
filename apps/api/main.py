import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from config import settings
from db import init_db
from routes.assets import router as assets_router
from routes.exports import router as exports_router
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
app.include_router(exports_router)


def _normalize_detail(detail) -> str:
    """Convert API error detail to a single user-friendly string."""
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        msgs = []
        for item in detail:
            if isinstance(item, dict):
                loc = item.get("loc", [])
                msg = item.get("msg", "Invalid value")
                field = loc[-1] if loc else "field"
                msgs.append(f"{field}: {msg}")
            else:
                msgs.append(str(item))
        return "; ".join(msgs) if msgs else "Validation error"
    return str(detail)


@app.exception_handler(RequestValidationError)
def validation_exception_handler(_request: Request, exc: RequestValidationError):
    """Normalize Pydantic validation errors to { detail: string }."""
    return JSONResponse(
        status_code=422,
        content={"detail": _normalize_detail(exc.errors())},
    )


@app.exception_handler(StarletteHTTPException)
def http_exception_handler(_request: Request, exc: StarletteHTTPException):
    """Normalize HTTP errors to { detail: string }."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": _normalize_detail(exc.detail)},
    )


@app.exception_handler(Exception)
def generic_exception_handler(_request: Request, exc: Exception):
    """Catch-all: return 500 with normalized detail."""
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again."},
    )


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
