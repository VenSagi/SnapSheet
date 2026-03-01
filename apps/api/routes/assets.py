"""Asset API routes: upload and file serving."""

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from config import settings
from db import get_connection

router = APIRouter(prefix="/assets", tags=["assets"])

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_MIMES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
EXT_TO_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


def _validate_image_file(file: UploadFile) -> tuple[str, str]:
    """Validate file type. Returns (ext, mime) or raises HTTPException."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: png, jpg, jpeg, webp. Got: {ext or 'unknown'}",
        )
    if file.content_type and file.content_type not in ALLOWED_MIMES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content type. Allowed: image/png, image/jpeg, image/webp. Got: {file.content_type}",
        )
    mime = EXT_TO_MIME.get(ext, "image/png")
    return ext, mime


def _get_asset_file_path(stored_path: str) -> Path:
    """Resolve stored_path (relative to UPLOAD_DIR) to absolute file path."""
    base = Path(settings.UPLOAD_DIR).resolve()
    full = (base / stored_path).resolve()
    try:
        full.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid asset path")
    return full


@router.get("/{asset_id}/file")
def get_asset_file(asset_id: str):
    """Serve the image file for an asset."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT stored_path, mime FROM assets WHERE id = ?",
            (asset_id,),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")

        stored_path = row["stored_path"]
        mime = row["mime"] or "image/png"

    path = _get_asset_file_path(stored_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Asset file not found: {asset_id}")

    return FileResponse(path, media_type=mime)
