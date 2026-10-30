"""Runtime configuration, read from environment variables (and a local `.env` in development)."""

from datetime import timedelta
from typing import Annotated, Self

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEFAULT_CORS_ORIGINS = (
    "https://english-learn-iwl.pages.dev",
    "http://localhost:8081",
)
# Public OAuth client ids allowed as `aud` (and `azp`) of Google ID tokens: the web client today.
DEFAULT_GOOGLE_CLIENT_IDS = (
    "78200832989-odkefhj0s4vla7h5p83gevs2440mctev.apps.googleusercontent.com",
)
MIN_JWT_SECRET_BYTES = 32
MIN_JWT_SECRET_DISTINCT_BYTES = 16  # rejects "xxxx…" and other patterned secrets
SIMPLE_MODE_KID = "default"
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
    google_client_ids: Annotated[list[str], NoDecode] = list(DEFAULT_GOOGLE_CLIENT_IDS)
    # Either one JWT_SECRET (signed with kid "default"), or JWT_KEYS (JSON {kid: secret}) with
    # JWT_ACTIVE_KID naming the signing key; every listed key still verifies.
    jwt_secret: SecretStr | None = None
    jwt_keys: dict[str, SecretStr] | None = None
    jwt_active_kid: str | None = None
    access_token_ttl: timedelta = timedelta(minutes=15)
    refresh_token_ttl: timedelta = timedelta(days=14)  # idle timeout, slid by every refresh
    session_max_lifetime: timedelta = timedelta(days=60)  # absolute, from the sign-in
    refresh_retry_grace: timedelta = timedelta(seconds=45)
    # How recent the Google sign-in must be for DELETE /v1/account.
    reauthentication_window: timedelta = timedelta(minutes=5)
    cors_origins: Annotated[list[str], NoDecode] = list(DEFAULT_CORS_ORIGINS)
    max_request_body_bytes: int = 1024 * 1024
    log_level: str = "INFO"

    @field_validator("jwt_secret")
    @classmethod
    def _strong_secret(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None:
            _check_secret("JWT_SECRET", value)
        return value

    @field_validator("jwt_keys")
    @classmethod
    def _strong_keys(cls, value: dict[str, SecretStr] | None) -> dict[str, SecretStr] | None:
        for kid, secret in (value or {}).items():
            _check_secret(f"JWT_KEYS[{kid!r}]", secret)
        return value

    @model_validator(mode="after")
    def _one_jwt_mode(self) -> Self:
        if (self.jwt_secret is None) == (self.jwt_keys is None):
            msg = "set either JWT_SECRET or JWT_KEYS (with JWT_ACTIVE_KID), not both"
            raise ValueError(msg)
        if self.jwt_keys is not None and self.jwt_active_kid not in self.jwt_keys:
            msg = "JWT_ACTIVE_KID must name one of the JWT_KEYS"
            raise ValueError(msg)
        return self

    def jwt_signing_keys(self) -> tuple[dict[str, str], str]:
        """Every verification key by kid, and the kid that signs new tokens."""
        if self.jwt_keys is not None and self.jwt_active_kid is not None:
            keys = {kid: secret.get_secret_value() for kid, secret in self.jwt_keys.items()}
            return keys, self.jwt_active_kid
        assert self.jwt_secret is not None  # noqa: S101 - guaranteed by _one_jwt_mode
        return {SIMPLE_MODE_KID: self.jwt_secret.get_secret_value()}, SIMPLE_MODE_KID

    @field_validator(
        "access_token_ttl",
        "refresh_token_ttl",
        "session_max_lifetime",
        "refresh_retry_grace",
        "reauthentication_window",
        mode="before",
    )
    @classmethod
    def _plain_seconds(cls, value: object) -> object:
        # `ACCESS_TOKEN_TTL=900` means seconds; ISO 8601 durations (`P30D`) also work.
        if isinstance(value, str) and value.strip().isdigit():
            return int(value)
        return value

    @field_validator(
        "access_token_ttl", "refresh_token_ttl", "session_max_lifetime", "reauthentication_window"
    )
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

    @field_validator("cors_origins", "google_client_ids", mode="before")
    @classmethod
    def _split_commas(cls, value: object) -> object:
        # `CORS_ORIGINS=https://a.example,https://b.example` in the environment.
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("google_client_ids")
    @classmethod
    def _some_client_id(cls, value: list[str]) -> list[str]:
        if not value:
            msg = "GOOGLE_CLIENT_IDS needs at least one client id"
            raise ValueError(msg)
        return value


def _check_secret(name: str, secret: SecretStr) -> None:
    raw = secret.get_secret_value().encode()
    if len(raw) < MIN_JWT_SECRET_BYTES:
        msg = f"{name} must have at least {MIN_JWT_SECRET_BYTES} bytes"
        raise ValueError(msg)
    if len(set(raw)) < MIN_JWT_SECRET_DISTINCT_BYTES:
        msg = f"{name} must have at least {MIN_JWT_SECRET_DISTINCT_BYTES} distinct bytes"
        raise ValueError(msg)
