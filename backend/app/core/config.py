from pydantic_settings import BaseSettings
from typing import Literal


class Settings(BaseSettings):
    RAIN_ENV: Literal["development", "staging", "production"] = "development"
    RAIN_VERSION: str = "6.0.0"
    RAIN_LOG_LEVEL: str = "debug"

    DATABASE_URL: str
    REDIS_URL: str = "redis://redis:6379/0"

    S3_BUCKET: str = "rain-audio"
    S3_ENDPOINT_URL: str = "http://minio:9000"
    S3_ACCESS_KEY: str
    S3_SECRET_KEY: str

    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "RS256"
    JWT_PUBLIC_KEY_PATH: str = "/etc/rain/jwt.pub"
    JWT_PRIVATE_KEY_PATH: str = "/etc/rain/jwt.key"

    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    RAIN_NORMALIZATION_VALIDATED: bool = False
    ANTHROPIC_API_KEY: str = ""
    ONNX_MODEL_PATH: str = "/models/rain_base.onnx"
    DEMUCS_MODEL: str = "htdemucs_6s"
    DEMUCS_DEVICE: str = "cpu"

    FRONTEND_URL: str = "http://localhost:5173"

    class Config:
        env_file = ".env"


settings = Settings()
