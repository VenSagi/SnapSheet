"""Project API routes."""

import io
import uuid
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from reportlab.lib.pagesizes import A4, letter
from reportlab.pdfgen import canvas

import json

from config import settings
from db import get_connection
from models import CreateProjectRequest, ExportRequest, ExportPlacementItem, SaveLayoutRequest

from routes.assets import _validate_image_file

router = APIRouter(prefix="/projects", tags=["projects"])

PAGE_SIZES = {"Letter": letter, "A4": A4}
INCH_TO_POINTS = 72


def _clamp_placement_to_bounds(
    item: ExportPlacementItem,
    page_w: float,
    page_h: float,
    margins: dict[str, float],
) -> ExportPlacementItem:
    """
    Clamp placement item to content area (within margins).
    Items outside bounds are moved and/or resized to fit.
    """
    ml = margins.get("left", 0) * INCH_TO_POINTS
    mr = margins.get("right", 0) * INCH_TO_POINTS
    mt = margins.get("top", 0) * INCH_TO_POINTS
    mb = margins.get("bottom", 0) * INCH_TO_POINTS

    content_x = ml
    content_y = mt
    content_right = page_w - mr
    content_bottom = page_h - mb
    content_w = max(1, content_right - content_x)
    content_h = max(1, content_bottom - content_y)

    x = max(content_x, min(content_right - 1, item.x))
    y = max(content_y, min(content_bottom - 1, item.y))
    w = max(1, min(content_w, item.w))
    h = max(1, min(content_h, item.h))

    # Ensure right/bottom edges stay within bounds
    if x + w > content_right:
        w = max(1, content_right - x)
    if y + h > content_bottom:
        h = max(1, content_bottom - y)

    rot = getattr(item, "rotation", 0) or 0
    return ExportPlacementItem(assetId=item.assetId, x=x, y=y, w=w, h=h, rotation=rot)


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


@router.get("/{project_id}/layout")
def get_layout(project_id: str):
    """Get saved layout for a project. Returns null if none saved."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Project {project_id} not found")

        row = conn.execute(
            "SELECT layout_json, updated_at FROM layouts WHERE project_id = ?",
            (project_id,),
        ).fetchone()

    if not row:
        return {"layout": None}

    try:
        layout = json.loads(row["layout_json"])
    except json.JSONDecodeError:
        return {"layout": None}

    return {"layout": layout, "updated_at": row["updated_at"]}


@router.put("/{project_id}/layout")
def save_layout(project_id: str, body: SaveLayoutRequest):
    """Save layout for a project. Overwrites existing."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Project {project_id} not found")

        layout_json = json.dumps(body.layout)
        updated_at = datetime.now(timezone.utc).isoformat()

        conn.execute(
            """INSERT INTO layouts (project_id, layout_json, updated_at)
               VALUES (?, ?, ?)
               ON CONFLICT(project_id) DO UPDATE SET
                 layout_json = excluded.layout_json,
                 updated_at = excluded.updated_at""",
            (project_id, layout_json, updated_at),
        )

    return {"updated_at": updated_at}


@router.post("/{project_id}/assets")
def upload_assets(project_id: str, files: list[UploadFile] = File(..., alias="files")):
    """Upload one or more images to a project. Multipart form-data, field name: files."""
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    max_assets = settings.MAX_ASSETS_PER_PROJECT

    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Project {project_id} not found")

        current_count = conn.execute(
            "SELECT COUNT(*) as n FROM assets WHERE project_id = ?",
            (project_id,),
        ).fetchone()["n"]
        if current_count + len(files) > max_assets:
            raise HTTPException(
                status_code=400,
                detail=f"Project cannot have more than {max_assets} assets. Current: {current_count}, adding: {len(files)}.",
            )

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


@router.post("/{project_id}/export")
def export_project(project_id: str, body: ExportRequest, request: Request):
    """
    Export project to PDF. All coordinates in PDF points (1 inch = 72 pts).
    Frontend: top-left origin, y down. ReportLab: bottom-left origin, y up.
    Conversion: rl_y = page_height - fe_y - fe_h.
    """
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Project {project_id} not found")

        # Validate page_count matches placements length
        if len(body.placements) != body.page_count:
            raise HTTPException(
                status_code=400,
                detail=f"placements length ({len(body.placements)}) must match page_count ({body.page_count})",
            )

        # Build asset_id -> stored_path map, validate all belong to project
        asset_paths = {}
        for page_data in body.placements:
            for item in page_data.items:
                if item.assetId in asset_paths:
                    continue
                arow = conn.execute(
                    "SELECT stored_path FROM assets WHERE id = ? AND project_id = ?",
                    (item.assetId, project_id),
                ).fetchone()
                if not arow:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Asset {item.assetId} not found or does not belong to project",
                    )
                asset_paths[item.assetId] = arow["stored_path"]

    export_id = str(uuid.uuid4())
    pts = PAGE_SIZES[body.paper]
    page_w, page_h = pts[0], pts[1]
    if body.orientation == "landscape":
        page_w, page_h = page_h, page_w

    out_dir = Path(settings.OUTPUT_DIR) / project_id
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf_filename = f"{export_id}.pdf"
    pdf_path = out_dir / pdf_filename
    rel_path = f"{project_id}/{pdf_filename}"

    c = canvas.Canvas(str(pdf_path), pagesize=(page_w, page_h))

    for page_idx, page_data in enumerate(body.placements):
        if page_idx > 0:
            c.showPage()

        for item in page_data.items:
            clamped = _clamp_placement_to_bounds(
                item, page_w, page_h, body.margins
            )
            img_path = Path(settings.UPLOAD_DIR) / asset_paths[clamped.assetId]
            if not img_path.exists():
                raise HTTPException(
                    status_code=400,
                    detail=f"Asset file not found: {clamped.assetId}",
                )
            rot = getattr(clamped, "rotation", 0) or 0
            if abs(rot) > 0.01:
                center_x = clamped.x + clamped.w / 2
                center_y = page_h - (clamped.y + clamped.h / 2)
                c.saveState()
                c.translate(center_x, center_y)
                c.rotate(-rot)
                c.translate(-clamped.w / 2, -clamped.h / 2)
                c.drawImage(
                    str(img_path), 0, 0, width=clamped.w, height=clamped.h
                )
                c.restoreState()
            else:
                rl_y = page_h - clamped.y - clamped.h
                c.drawImage(
                    str(img_path), clamped.x, rl_y, width=clamped.w, height=clamped.h
                )

    c.save()

    created_at = datetime.now(timezone.utc).isoformat()

    # Resolve version_name: use provided or auto-increment v1, v2, ...
    version_name = body.version_name
    if not version_name:
        with get_connection() as conn:
            rows = conn.execute(
                "SELECT version_name FROM exports WHERE project_id = ? ORDER BY created_at DESC",
                (project_id,),
            ).fetchall()
        max_n = 0
        for r in rows:
            v = r["version_name"] or ""
            if v.startswith("v") and v[1:].isdigit():
                max_n = max(max_n, int(v[1:]))
        version_name = f"v{max_n + 1}"

    with get_connection() as conn:
        conn.execute(
            "INSERT INTO exports (id, project_id, pdf_path, version_name, created_at) VALUES (?, ?, ?, ?, ?)",
            (export_id, project_id, rel_path, version_name, created_at),
        )

    base_url = str(request.base_url).rstrip("/")
    download_url = f"{base_url}/exports/{export_id}/download"

    return {"exportId": export_id, "downloadUrl": download_url}
