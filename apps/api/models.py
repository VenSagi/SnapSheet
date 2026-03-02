"""Pydantic models for request/response validation."""

from pydantic import BaseModel, Field


class CreateProjectRequest(BaseModel):
    """Request body for POST /projects."""

    name: str = Field(..., min_length=1, description="Project name")


class ExportPlacementItem(BaseModel):
    """Single image placement. All units in PDF points (1 inch = 72 pts)."""

    assetId: str
    x: float = Field(..., ge=0)
    y: float = Field(..., ge=0)
    w: float = Field(..., gt=0)
    h: float = Field(..., gt=0)
    rotation: float = Field(0, description="Rotation in degrees, clockwise")


class ExportPage(BaseModel):
    """Placements for one page."""

    items: list[ExportPlacementItem] = Field(default_factory=list)


class SaveLayoutRequest(BaseModel):
    """Request body for PUT /projects/{id}/layout."""

    layout: dict = Field(..., description="JSON: { settings, placements }")


class ExportRequest(BaseModel):
    """Request body for POST /projects/{id}/export. Units: points."""

    paper: str = Field(..., pattern="^(Letter|A4)$")
    orientation: str = Field(..., pattern="^(portrait|landscape)$")
    margins: dict[str, float] = Field(
        ...,
        description="top, right, bottom, left in inches",
    )
    page_count: int = Field(..., ge=1)
    placements: list[ExportPage] = Field(
        ...,
        description="pages[] each with items[] { assetId, x, y, w, h } in points",
    )
    version_name: str | None = Field(None, description="Optional e.g. 'v1'; if missing, auto-increment")
