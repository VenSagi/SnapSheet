"""Settings loaded from environment variables with safe defaults."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ENV: str = "dev"
    WEB_ORIGIN: str = "http://localhost:3000"
    UPLOAD_DIR: str = "data/uploads"
    OUTPUT_DIR: str = "data/outputs"
    MAX_UPLOAD_MB: int = 25
    DB_PATH: str = "data/db.sqlite"


settings = Settings()
