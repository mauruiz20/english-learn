"""Runtime configuration, read from environment variables (and a local `.env` in development)."""

import json
import os
from datetime import timedelta
from ipaddress import IPv4Network, IPv6Network, ip_network
from pathlib import Path
from typing import Annotated, Any, Literal, Self
from urllib.parse import urlsplit

from pydantic import SecretStr, field_validator, model_validator
from pydantic.fields import FieldInfo
from pydantic_settings import (
    BaseSettings,
    NoDecode,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
    SettingsError,
)

DEFAULT_CORS_ORIGINS = (
    "https://english.maumar.com.ar",
    "http://localhost:8081",  # Expo web dev server; production refuses localhost
)
# Sites allowed to create progress transfers (`POST /v1/transfers`), besides CORS_ORIGINS: the
# old address of the web app, which hands its learners' progress over to the new one.
DEFAULT_TRANSFER_SOURCE_ORIGINS = ("https://english-learn-iwl.pages.dev",)
# Public OAuth client ids allowed as `aud` (and `azp`) of Google ID tokens: the web client today.
DEFAULT_GOOGLE_CLIENT_IDS = (
    "78200832989-odkefhj0s4vla7h5p83gevs2440mctev.apps.googleusercontent.com",
)
MIN_JWT_SECRET_BYTES = 32
MIN_JWT_SECRET_DISTINCT_BYTES = 16  # rejects "xxxx…" and other patterned secrets
SIMPLE_MODE_KID = "default"
_ASYNC_DRIVER = "postgresql+asyncpg://"
_POSTGRES_SCHEMES = ("postgres://", "postgresql://", _ASYNC_DRIVER)
# Secrets that may also come from a file named by `<NAME>_FILE` (Docker secrets).
FILE_BACKED_FIELDS = ("database_url", "jwt_secret", "jwt_keys")
_JSON_FIELDS = frozenset({"jwt_keys"})


class SecretFilesSource(PydanticBaseSettingsSource):
    """Reads `<NAME>_FILE` from the process environment for the file-backed fields.

    The file's content, without trailing newlines, is the value. Setting both `<NAME>` (in the
    environment or `.env`) and `<NAME>_FILE` is an error, and so is an unreadable or empty file.
    Messages name the variable and the path, never the content.
    """

    def __init__(
        self,
        settings_cls: type[BaseSettings],
        competing: tuple[PydanticBaseSettingsSource, ...],
    ) -> None:
        super().__init__(settings_cls)
        self._competing = competing

    def get_field_value(self, field: FieldInfo, field_name: str) -> tuple[Any, str, bool]:
        return None, field_name, False  # unused: __call__ reads every field at once

    def __call__(self) -> dict[str, Any]:
        environ = {name.upper(): value for name, value in os.environ.items()}
        requested = {
            field: environ[f"{field.upper()}_FILE"]
            for field in FILE_BACKED_FIELDS
            if field in self.settings_cls.model_fields and f"{field.upper()}_FILE" in environ
        }
        if not requested:
            return {}
        supplied = {name for source in self._competing for name in source()}
        values: dict[str, Any] = {}
        for field, path in requested.items():
            name = field.upper()
            if field in supplied:
                msg = f"set {name} or {name}_FILE, not both"
                raise SettingsError(msg)
            content = _read_secret_file(f"{name}_FILE", path)
            values[field] = (
                _decode_json(f"{name}_FILE", path, content) if (field in _JSON_FIELDS) else content
            )
        return values


def _read_secret_file(variable: str, path: str) -> str:
    try:
        content = Path(path).read_bytes().decode()
    except OSError as error:
        msg = f"{variable}: cannot read {path} ({error.strerror or type(error).__name__})"
        raise SettingsError(msg) from None
    except UnicodeDecodeError:
        msg = f"{variable}: {path} is not UTF-8 text"
        raise SettingsError(msg) from None
    content = content.rstrip("\r\n")
    if not content:
        msg = f"{variable}: {path} is empty"
        raise SettingsError(msg)
    return content


def _decode_json(variable: str, path: str, content: str) -> object:
    try:
        return json.loads(content)
    except ValueError:
        msg = f"{variable}: {path} is not valid JSON"
        raise SettingsError(msg) from None


class DatabaseSettings(BaseSettings):
    """The only setting migrations need, so `alembic` runs without the auth secrets."""

    # Validation errors never echo the input: it may be a secret (JWT_SECRET, DATABASE_URL).
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    database_url: str

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # Explicit arguments, then `<NAME>_FILE`, then the environment, then `.env`.
        secret_files = SecretFilesSource(settings_cls, competing=(env_settings, dotenv_settings))
        return init_settings, secret_files, env_settings, dotenv_settings, file_secret_settings

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
    # development: local defaults (CORS includes localhost, /docs served). test: same, for the
    # suite. production: CORS_ORIGINS must be set explicitly (https, no localhost or "*"), the
    # refresh cookie must be Secure, and /docs, /redoc and /openapi.json are not served.
    env: Literal["development", "test", "production"] = "development"
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
    # Extra origins for `POST /v1/transfers` only (no credentials); claims stay on CORS_ORIGINS.
    transfer_source_origins: Annotated[list[str], NoDecode] = list(DEFAULT_TRANSFER_SOURCE_ORIGINS)
    # The refresh cookie (cookie token transport) carries `Secure`; production refuses false.
    refresh_cookie_secure: bool = True
    max_request_body_bytes: int = 1024 * 1024
    log_level: str = "INFO"
    # Where the client address (rate-limit key) comes from: the TCP peer (`socket`), or, behind a
    # Cloudflare Tunnel, `CF-Connecting-IP` when the peer is in TRUSTED_PROXY_CIDRS.
    client_ip_source: Literal["socket", "cf-connecting-ip"] = "socket"
    trusted_proxy_cidrs: Annotated[list[IPv4Network | IPv6Network], NoDecode] = []

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

    @model_validator(mode="after")
    def _exact_cors_origins(self) -> Self:
        # CORS allows credentials (the refresh cookie), so every origin is listed exactly.
        if "*" in self.cors_origins:
            msg = 'CORS_ORIGINS must list exact origins, not "*"'
            raise ValueError(msg)
        if "*" in self.transfer_source_origins:
            msg = 'TRANSFER_SOURCE_ORIGINS must list exact origins, not "*"'
            raise ValueError(msg)
        return self

    @field_validator("trusted_proxy_cidrs", mode="before")
    @classmethod
    def _parse_cidrs(cls, value: object) -> object:
        # `TRUSTED_PROXY_CIDRS=172.18.0.0/16,fd00::/8`; a bare address means that one host.
        if not isinstance(value, str):
            return value
        networks: list[IPv4Network | IPv6Network] = []
        for item in (part.strip() for part in value.split(",")):
            if not item:
                continue
            try:
                networks.append(ip_network(item))
            except ValueError:
                msg = f"TRUSTED_PROXY_CIDRS has an invalid network: {item!r}"
                raise ValueError(msg) from None
        return networks

    @model_validator(mode="after")
    def _trusted_proxies_for_cloudflare(self) -> Self:
        if self.client_ip_source == "cf-connecting-ip" and not self.trusted_proxy_cidrs:
            msg = "CLIENT_IP_SOURCE=cf-connecting-ip requires TRUSTED_PROXY_CIDRS"
            raise ValueError(msg)
        return self

    @model_validator(mode="after")
    def _production_rules(self) -> Self:
        if not self.is_production:
            return self
        if not self.refresh_cookie_secure:
            msg = "ENV=production requires REFRESH_COOKIE_SECURE=true"
            raise ValueError(msg)
        if "cors_origins" not in self.model_fields_set or not self.cors_origins:
            msg = "ENV=production requires CORS_ORIGINS to be set explicitly"
            raise ValueError(msg)
        unsafe = [origin for origin in self.cors_origins if not _is_public_https(origin)]
        if unsafe:
            msg = f"CORS_ORIGINS in production must be public https origins, not {unsafe}"
            raise ValueError(msg)
        unsafe = [o for o in self.transfer_source_origins if not _is_public_https(o)]
        if unsafe:
            msg = (
                f"TRANSFER_SOURCE_ORIGINS in production must be public https origins, not {unsafe}"
            )
            raise ValueError(msg)
        return self

    @property
    def is_production(self) -> bool:
        return self.env == "production"

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

    @field_validator("cors_origins", "transfer_source_origins", "google_client_ids", mode="before")
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


def _is_public_https(origin: str) -> bool:
    parts = urlsplit(origin)
    return parts.scheme == "https" and parts.hostname not in {None, "localhost", "127.0.0.1", "::1"}
