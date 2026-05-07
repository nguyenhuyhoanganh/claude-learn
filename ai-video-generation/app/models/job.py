import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, JSON, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database import Base


class JobStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"


class PhaseStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uuid.uuid4().hex[:8])
    status: Mapped[JobStatus] = mapped_column(SAEnum(JobStatus), default=JobStatus.queued)
    input: Mapped[dict] = mapped_column(JSON)           # prompt, image paths, options
    output: Mapped[dict | None] = mapped_column(JSON, nullable=True)   # output file keys
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)

    phases: Mapped[list["JobPhase"]] = relationship(back_populates="job",
                                                     cascade="all, delete-orphan",
                                                     order_by="JobPhase.created_at")
    artifacts: Mapped[list["Artifact"]] = relationship(back_populates="job",
                                                        cascade="all, delete-orphan")


class JobPhase(Base):
    __tablename__ = "job_phases"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"))
    phase: Mapped[str] = mapped_column(String)          # script | images | video | audio | assembly
    status: Mapped[PhaseStatus] = mapped_column(SAEnum(PhaseStatus), default=PhaseStatus.pending)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)

    job: Mapped["Job"] = relationship(back_populates="phases")
