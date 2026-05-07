from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings

router = APIRouter(prefix="/files", tags=["files"])


@router.get("/{key:path}")
async def serve_file(key: str):
    """Serve file từ local storage (dev only — prod dùng S3 presigned URL)."""
    if settings.storage_backend != "local":
        raise HTTPException(status_code=404, detail="Use S3 URL directly in production")

    path = Path(settings.local_storage_path) / key
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(path)
