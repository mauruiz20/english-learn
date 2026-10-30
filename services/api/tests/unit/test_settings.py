from datetime import timedelta
from typing import Any

import pytest
from pydantic import ValidationError

from english_learn_api.settings import DEFAULT_CORS_ORIGINS, DEFAULT_GOOGLE_CLIENT_IDS, Settings

SECRET = "x" * 32


def make(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "database_url": "postgresql+asyncpg://app:app@localhost:5432/app",
        "jwt_secret": SECRET,
        **overrides,
    }
    return Settings(_env_file=None, **values)


def test_defaults() -> None:
    settings = make()

    assert settings.access_token_ttl == timedelta(minutes=15)
    assert settings.refresh_token_ttl == timedelta(days=14)
    assert settings.session_max_lifetime == timedelta(days=60)
    assert settings.refresh_retry_grace == timedelta(seconds=45)
    assert settings.cors_origins == list(DEFAULT_CORS_ORIGINS)
    assert settings.google_client_ids == list(DEFAULT_GOOGLE_CLIENT_IDS)
    assert DEFAULT_GOOGLE_CLIENT_IDS == (
        "78200832989-odkefhj0s4vla7h5p83gevs2440mctev.apps.googleusercontent.com",
    )
    assert DEFAULT_CORS_ORIGINS == (
        "https://english-learn-iwl.pages.dev",
        "http://localhost:8081",
    )


def test_jwt_secret_must_have_at_least_32_bytes() -> None:
    with pytest.raises(ValidationError, match="at least 32 bytes"):
        make(jwt_secret="x" * 31)


def test_jwt_secret_counts_bytes_not_characters() -> None:
    # 16 two-byte characters = 32 bytes.
    assert make(jwt_secret="ñ" * 16).jwt_secret.get_secret_value() == "ñ" * 16


def test_jwt_secret_is_masked_in_repr() -> None:
    assert SECRET not in repr(make())


@pytest.mark.parametrize(
    "url",
    [
        "postgres://app:app@db:5432/app",
        "postgresql://app:app@db:5432/app",
        "postgresql+asyncpg://app:app@db:5432/app",
    ],
)
def test_database_url_is_normalized_to_asyncpg(url: str) -> None:
    assert make(database_url=url).database_url == "postgresql+asyncpg://app:app@db:5432/app"


def test_database_url_rejects_other_databases() -> None:
    with pytest.raises(ValidationError, match="PostgreSQL"):
        make(database_url="mysql://app:app@db/app")


def test_reads_environment_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h:5432/d")
    monkeypatch.setenv(
        "GOOGLE_CLIENT_IDS", "web.apps.googleusercontent.com, ios.apps.googleusercontent.com"
    )
    monkeypatch.setenv("JWT_SECRET", SECRET)
    monkeypatch.setenv("ACCESS_TOKEN_TTL", "300")
    monkeypatch.setenv("REFRESH_TOKEN_TTL", "P7D")
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example, https://b.example")
    monkeypatch.setenv("REFRESH_RETRY_GRACE", "10")
    monkeypatch.setenv("SESSION_MAX_LIFETIME", "P90D")

    settings = Settings(_env_file=None)

    assert settings.database_url == "postgresql+asyncpg://u:p@h:5432/d"
    assert settings.google_client_ids == [
        "web.apps.googleusercontent.com",
        "ios.apps.googleusercontent.com",
    ]
    assert settings.access_token_ttl == timedelta(minutes=5)
    assert settings.refresh_token_ttl == timedelta(days=7)
    assert settings.cors_origins == ["https://a.example", "https://b.example"]
    assert settings.refresh_retry_grace == timedelta(seconds=10)
    assert settings.session_max_lifetime == timedelta(days=90)


def test_the_retry_grace_may_be_zero_but_not_negative() -> None:
    assert make(refresh_retry_grace=timedelta(0)).refresh_retry_grace == timedelta(0)
    with pytest.raises(ValidationError, match="negative"):
        make(refresh_retry_grace=timedelta(seconds=-1))


@pytest.mark.parametrize("field", ["access_token_ttl", "refresh_token_ttl", "session_max_lifetime"])
def test_token_ttls_must_be_positive(field: str) -> None:
    with pytest.raises(ValidationError, match="positive"):
        make(**{field: timedelta(0)})


def test_google_client_ids_must_not_be_empty() -> None:
    with pytest.raises(ValidationError, match="GOOGLE_CLIENT_IDS"):
        make(google_client_ids=" , ")
