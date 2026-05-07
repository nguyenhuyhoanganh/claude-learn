from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.job import Job, JobPhase, JobStatus, PhaseStatus
from app.schemas.job import JobCreate

_PHASE_WEIGHT = {
    "script": 10,
    "images": 25,
    "video": 35,
    "audio": 15,
    "assembly": 15,
}


class JobService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, payload: JobCreate) -> Job:
        job = Job(
            input={
                "prompt": payload.prompt,
                "product_image_keys": payload.product_image_keys,
                "face_image_keys": payload.face_image_keys,
                "n_chunks": payload.n_chunks,
                "chunk_duration": payload.chunk_duration,
                "language": payload.language,
                "tone": payload.tone,
                "video_model": payload.video_model,
            }
        )
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)
        return job

    async def get(self, job_id: str) -> Optional[Job]:
        result = await self.db.execute(
            select(Job).options(selectinload(Job.phases)).where(Job.id == job_id)
        )
        return result.scalar_one_or_none()

    async def list_jobs(self, limit: int = 20, offset: int = 0) -> list[Job]:
        result = await self.db.execute(
            select(Job).order_by(Job.created_at.desc()).limit(limit).offset(offset)
        )
        return list(result.scalars())

    async def update_status(self, job_id: str, status: JobStatus,
                             output: dict | None = None, error: str | None = None) -> None:
        job = await self.get(job_id)
        if not job:
            return
        job.status = status
        if output:
            job.output = output
        if error:
            job.error = error
        if status in (JobStatus.completed, JobStatus.failed):
            job.completed_at = datetime.now(timezone.utc)
        await self.db.commit()

    async def update_progress(self, job_id: str, phase: str, pct: int, cost_usd: float) -> None:
        job = await self.get(job_id)
        if not job:
            return
        job.status = JobStatus.running
        job.cost_usd = cost_usd
        job.output = {**(job.output or {}), "phase": phase, "progress_pct": pct}
        await self.db.commit()

    async def fail_job(self, job_id: str, error: str) -> None:
        await self.update_status(job_id, JobStatus.failed, error=error)

    async def complete_job(self, job_id: str, final_video_key: str, cost_usd: float) -> None:
        job = await self.get(job_id)
        if not job:
            return
        job.status = JobStatus.completed
        job.cost_usd = cost_usd
        job.completed_at = datetime.now(timezone.utc)
        job.output = {**(job.output or {}), "final_video_key": final_video_key}
        await self.db.commit()

    async def add_phase(self, job_id: str, phase: str) -> JobPhase:
        phase_obj = JobPhase(job_id=job_id, phase=phase, status=PhaseStatus.running)
        self.db.add(phase_obj)
        await self.db.commit()
        await self.db.refresh(phase_obj)
        return phase_obj

    async def complete_phase(self, phase_id: int, cost: float = 0.0,
                              meta: dict | None = None) -> None:
        result = await self.db.execute(select(JobPhase).where(JobPhase.id == phase_id))
        phase = result.scalar_one_or_none()
        if not phase:
            return
        phase.status = PhaseStatus.completed
        phase.cost_usd = cost
        phase.completed_at = datetime.now(timezone.utc)
        if meta:
            phase.metadata = meta

        # Update job cost
        job = await self.get(phase.job_id)
        if job:
            job.cost_usd = (job.cost_usd or 0) + cost
        await self.db.commit()

    async def fail_phase(self, phase_id: int, error: str) -> None:
        result = await self.db.execute(select(JobPhase).where(JobPhase.id == phase_id))
        phase = result.scalar_one_or_none()
        if phase:
            phase.status = PhaseStatus.failed
            phase.metadata = {"error": error}
            await self.db.commit()

    @staticmethod
    def compute_progress(job: Job) -> int:
        completed = {p.phase for p in job.phases if p.status == PhaseStatus.completed}
        return sum(_PHASE_WEIGHT.get(ph, 0) for ph in completed)
