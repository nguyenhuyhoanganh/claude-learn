import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.job import JobStatus
from app.schemas.job import JobCreate, JobResponse, PhaseInfo, UploadResponse
from app.services.job_service import JobService
from app.services.storage import storage
from app.pipeline.tasks import run_pipeline_task

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    """Upload ảnh sản phẩm hoặc khuôn mặt, trả về storage key."""
    data = await file.read()
    key = f"uploads/{file.filename}"
    url = await storage.upload_bytes(data, key)
    return UploadResponse(key=key, url=url)


@router.post("", response_model=dict)
async def create_job(payload: JobCreate, db: AsyncSession = Depends(get_db)):
    """Tạo job mới, dispatch pipeline vào Celery."""
    service = JobService(db)
    job = await service.create(payload)

    # Dispatch sang Celery (non-blocking)
    inp = job.input or {}
    run_pipeline_task.delay(
        job_id=job.id,
        prompt=inp.get("prompt", ""),
        product_image_keys=inp.get("product_image_keys", []),
        face_image_keys=inp.get("face_image_keys", []),
        n_chunks=inp.get("n_chunks", 5),
        chunk_duration=inp.get("chunk_duration", 6),
        language=inp.get("language", "vi"),
        tone=inp.get("tone", "professional"),
        video_model=inp.get("video_model", "kling-v2-5-turbo"),
    )

    return {"job_id": job.id, "status": "queued"}


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    service = JobService(db)
    job = await service.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobResponse(
        job_id=job.id,
        status=job.status,
        progress=service.compute_progress(job),
        current_phase=next(
            (p.phase for p in reversed(job.phases) if p.status == "running"), None
        ),
        cost_usd=job.cost_usd,
        output=job.output,
        error=job.error,
        created_at=job.created_at,
        completed_at=job.completed_at,
        phases=[
            PhaseInfo(
                phase=p.phase,
                status=p.status,
                cost_usd=p.cost_usd,
                completed_at=p.completed_at,
            )
            for p in job.phases
        ],
    )


@router.get("/{job_id}/stream")
async def stream_job_progress(job_id: str, db: AsyncSession = Depends(get_db)):
    """SSE endpoint — push progress updates đến client."""
    async def event_generator() -> AsyncGenerator[str, None]:
        service = JobService(db)
        while True:
            job = await service.get(job_id)
            if not job:
                yield _sse({"error": "not found"})
                return

            payload = {
                "status": job.status,
                "progress": service.compute_progress(job),
                "cost_usd": job.cost_usd,
                "current_phase": next(
                    (p.phase for p in reversed(job.phases) if p.status == "running"), None
                ),
            }
            yield _sse(payload)

            if job.status in (JobStatus.completed, JobStatus.failed):
                return

            await asyncio.sleep(2)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("", response_model=list[JobResponse])
async def list_jobs(limit: int = 20, offset: int = 0,
                    db: AsyncSession = Depends(get_db)):
    service = JobService(db)
    jobs = await service.list_jobs(limit, offset)
    return [
        JobResponse(
            job_id=j.id, status=j.status,
            progress=service.compute_progress(j),
            current_phase=None, cost_usd=j.cost_usd,
            output=j.output, error=j.error,
            created_at=j.created_at, completed_at=j.completed_at, phases=[],
        )
        for j in jobs
    ]


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"
