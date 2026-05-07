from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from app.models.job import JobStatus


class JobCreate(BaseModel):
    prompt: str
    product_image_keys: list[str] = Field(default_factory=list)
    face_image_keys: list[str] = Field(default_factory=list)
    n_chunks: int = Field(5, ge=2, le=12)
    chunk_duration: int = Field(6, ge=3, le=10)
    language: str = "vi"
    tone: str = "luxury"
    video_model: str = "kling"


class PhaseInfo(BaseModel):
    phase: str
    status: str
    cost_usd: float
    completed_at: Optional[datetime]


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: int                       # 0-100
    current_phase: Optional[str]
    cost_usd: float
    output: Optional[dict]
    error: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]
    phases: list[PhaseInfo]

    model_config = {"from_attributes": True}


class UploadResponse(BaseModel):
    key: str
    url: str
