"""Runtime configuration, read from environment variables (and a local `.env` in development)."""

from datetime import timedelta
from typing import Annotated

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEFAULT_CORS_ORIGINS = (
    "https://english-learn-iwl.pages.dev",
    "http://localhost:8081",
)
MIN_JWT_SECRET_BYTES = 32
_ASYNC_DRIVER = "postgresql+asyncpg://"
_POSTGRES_SCHEMES = ("postgres://", "postgresql://", _ASYNC_DRIVER)


class DatabaseSettings(BaseSettings):
    """The only setting migrations need, so `alembic` runs without the auth secrets."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str

    @field_validator("database_url")
    @classmethod
    def _use_asyncpg(cls, value: str) -> str:
        # Hosting providers (Render, Heroku) hand out `postgres://` or `postgresql://` URLs.
        for scheme in _POSTGRES_SCHEMES:
            if value.startswith(scheme):
                return _ASYNC_DRIVER + value.removeprefix(scheme)
        msg = "DATABASE_URL must be a PostgreSQL URL"
        raise ValueError(msg)


class Settings(DatabaseSettings):
    google_client_id: str
    jwt_secret: SecretStr
    access_token_ttl: timedelta = timedelta(minutes=15)
    refresh_token_ttl: timedelta = timedelta(days=14)  # idle timeout, slid by every refresh
    session_max_lifetime: timedelta = timedelta(days=60)  # absolute, from the sign-in
    refresh_retry_grace: timedelta = timedelta(seconds=45)
    cors_origins: Annotated[list[str], NoDecode] = list(DEFAULT_CORS_ORIGINS)
    max_request_body_bytes: int = 1024 * 1024
    log_level: str = "INFO"

    @field_validator("jwt_secret")
    @classmethod
    def _strong_secret(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value().encode()) < MIN_JWT_SECRET_BYTES:
            msg = f"JWT_SECRET must have at least {MIN_JWT_SECRET_BYTES} bytes"
            raise ValueError(msg)
        return value

    @field_validator(
        "access_token_ttl",
        "refresh_token_ttl",
        "session_max_lifetime",
        "refresh_retry_grace",
        mode="before",
    )
    @classmethod
    def _plain_seconds(cls, value: object) -> object:
        # `ACCESS_TOKEN_TTL=900` means seconds; ISO 8601 durations (`P30D`) also work.
        if isinstance(value, str) and value.strip().isdigit():
            return int(value)
        return value

    @field_validator("access_token_ttl", "refresh_token_ttl", "session_max_lifetime")
    @classmethod
    def _positive(cls, value: timedelta) -> timedelta:
        if value <= timedelta(0):
            msg = "token lifetimes must be positive"
            raise ValueError(msg)
        return value

    @field_validator("refresh_retry_grace")
    @classmethod
    def _not_negative(cls, value: timedelta) -> timedelta:
        if value < timedelta(0):
            msg = "REFRESH_RETRY_GRACE must not be negative"
            raise ValueError(msg)
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        # `CORS_ORIGINS=https://a.example,https://b.example` in the environment.
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value
