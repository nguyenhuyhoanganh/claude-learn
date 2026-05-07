"""
Storage service — local filesystem (dev) or S3-compatible (prod).
All code uses storage_key (path/to/file.ext) as the unique identifier.
"""
import shutil
import tempfile
from pathlib import Path

from app.config import settings


class StorageService:
    def __init__(self):
        if settings.storage_backend == "s3":
            import boto3
            self._s3 = boto3.client(
                "s3",
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
                region_name=settings.aws_region,
                endpoint_url=settings.s3_endpoint_url or None,
            )
        else:
            self._s3 = None
            Path(settings.local_storage_path).mkdir(parents=True, exist_ok=True)

    async def upload_file(self, local_path: str, key: str,
                           content_type: str = "application/octet-stream") -> str:
        """Upload file from local path, return public URL."""
        if self._s3:
            self._s3.upload_file(
                local_path, settings.s3_bucket, key,
                ExtraArgs={"ContentType": content_type},
            )
            return self._public_url(key)
        dest = Path(settings.local_storage_path) / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local_path, dest)
        return f"/api/files/{key}"

    async def upload_bytes(self, data: bytes, key: str,
                            content_type: str = "application/octet-stream") -> str:
        if self._s3:
            self._s3.put_object(
                Bucket=settings.s3_bucket, Key=key, Body=data,
                ContentType=content_type,
            )
            return self._public_url(key)
        dest = Path(settings.local_storage_path) / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return f"/api/files/{key}"

    async def download_to(self, key: str, local_path: str | None = None) -> str:
        """Download to local path (creates a temp file if not specified). Returns local path."""
        if local_path is None:
            suffix = Path(key).suffix or ".bin"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
                local_path = f.name

        if self._s3:
            self._s3.download_file(settings.s3_bucket, key, local_path)
            return local_path

        src = Path(settings.local_storage_path) / key
        shutil.copy2(src, local_path)
        return local_path

    async def get_public_url(self, key: str) -> str:
        """Return a publicly accessible URL for the given storage key."""
        if self._s3:
            return self._public_url(key)
        return f"/api/files/{key}"

    def local_path(self, key: str) -> str:
        return str(Path(settings.local_storage_path) / key)

    def _public_url(self, key: str) -> str:
        base = settings.s3_endpoint_url or f"https://{settings.s3_bucket}.s3.amazonaws.com"
        return f"{base}/{key}"


storage = StorageService()
