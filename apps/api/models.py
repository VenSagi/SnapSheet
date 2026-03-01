"""Pydantic models for request/response validation."""

from pydantic import BaseModel, Field


class CreateProjectRequest(BaseModel):
    """Request body for POST /projects."""

    name: str = Field(..., min_length=1, description="Project name")
