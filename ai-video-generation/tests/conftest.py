import pytest
import os

# Ensure mock mode for all tests by default
os.environ.setdefault("MOCK", "true")
os.environ.setdefault("STORAGE_BACKEND", "local")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://user:password@localhost:5432/videogen_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")
