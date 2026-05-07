from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    secret_key: str = "dev-secret"

    # Database
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/videogen"

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    # Storage
    storage_backend: str = "local"  # local | s3
    local_storage_path: str = "./storage"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "auto"
    s3_bucket: str = "videogen-outputs"
    s3_endpoint_url: str = ""

    # AI APIs
    openai_api_key: str = ""
    fal_key: str = ""
    replicate_api_token: str = ""
    runwayml_api_secret: str = ""
    kling_api_key: str = ""
    elevenlabs_api_key: str = ""
    fashn_api_key: str = ""

    # Pipeline
    default_video_model: str = "kling"
    mock: bool = False


settings = Settings()
