from datetime import datetime, timezone
from sqlalchemy import String, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"))
    artifact_type: Mapped[str] = mapped_column(String)   # image | video_chunk | audio | final_video
    storage_key: Mapped[str] = mapped_column(String)     # S3 key or local path
    metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=_now)

    job: Mapped["Job"] = relationship(back_populates="artifacts")  # type: ignore[name-defined]
