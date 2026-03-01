"""Project API routes."""

import io
import uuid
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image
from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from config import settings
from db import get_connection
from models import CreateProjectRequest
from routes.assets import _validate_image_file

router = APIRouter(prefix="/projects", tags=["projects"])


def _row_to_project(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "created_at": row["created_at"],
    }


def _row_to_asset(row, base_url: str = "") -> dict:
    """Convert DB row to asset dict. base_url is used for file_url."""
    asset_id = row["id"]
    out = {
        "id": asset_id,
        "project_id": row["project_id"],
        "original_filename": row["original_filename"],
        "stored_filename": row["stored_filename"],
        "stored_path": row["stored_path"],
        "width": row["width"],
        "height": row["height"],
        "mime": row["mime"],
        "created_at": row["created_at"],
    }
    if base_url:
        out["file_url"] = f"{base_url.rstrip('/')}/assets/{asset_id}/file"
    return out


@router.post("")
def create_project(body: CreateProjectRequest):
    """Create a new project. Body: { "name": "..." }."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name cannot be empty")

    project_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    with get_connection() as conn:
        conn.execute(
            "INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)",
            (project_id, name, created_at),
        )

    return {"id": project_id, "name": name, "created_at": created_at}


@router.get("/{project_id}")
def get_project(project_id: str, request: Request):
    """Get project by ID with its assets (including file_url for each asset)."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, name, created_at FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Project {project_id} not found")

        project = _row_to_project(row)

        assets_rows = conn.execute(
            "SELECT id, project_id, original_filename, stored_filename, stored_path, width, height, mime, created_at FROM assets WHERE project_id = ? ORDER BY created_at",
            (project_id,),
        ).fetchall()

        base_url = str(request.base_url).rstrip("/")
        assets = [_row_to_asset(r, base_url) for r in assets_rows]

    return {"project": project, "assets": assets}


@router.post("/{project_id}/assets")
def upload_assets(project_id: str, files: list[UploadFile] = File(..., alias="files")):
    """Upload one or more images to a project. Multipart form-data, field name: files."""
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024

    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Project {project_id} not found")

    upload_dir = Path(settings.UPLOAD_DIR) / project_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    created = []
    for upload in files:
        ext, mime = _validate_image_file(upload)
        content = upload.file.read()
        if len(content) > max_bytes:
            raise HTTPException(
                status_code=400,
                detail=f"File {upload.filename} exceeds {settings.MAX_UPLOAD_MB}MB limit",
            )

        asset_id = str(uuid.uuid4())
        stored_filename = f"{asset_id}{ext}"
        stored_path = f"{project_id}/{stored_filename}"
        file_path = upload_dir / stored_filename

        img = Image.open(io.BytesIO(content))
        width, height = img.size

        file_path.write_bytes(content)
        created_at = datetime.now(timezone.utc).isoformat()

        with get_connection() as conn:
            conn.execute(
                """INSERT INTO assets (id, project_id, original_filename, stored_filename, stored_path, width, height, mime, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    asset_id,
                    project_id,
                    upload.filename or stored_filename,
                    stored_filename,
                    stored_path,
                    width,
                    height,
                    mime,
                    created_at,
                ),
            )

        created.append({
            "id": asset_id,
            "original_filename": upload.filename or stored_filename,
            "width": width,
            "height": height,
            "mime": mime,
        })

    return {"uploaded": len(created), "assets": created}
