"""Export API routes: PDF generation and download."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from config import settings
from db import get_connection

router = APIRouter(prefix="/exports", tags=["exports"])


@router.get("/{export_id}/download")
def download_export(export_id: str):
    """Serve the PDF file for an export."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT pdf_path, project_id FROM exports WHERE id = ?",
            (export_id,),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Export {export_id} not found")

        pdf_path = row["pdf_path"]

    path = Path(settings.OUTPUT_DIR) / pdf_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="Export file not found")

    return FileResponse(path, media_type="application/pdf", filename=f"cheatsheet-{export_id}.pdf")
