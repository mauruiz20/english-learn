from datetime import timedelta

import pytest
from pydantic import ValidationError

from english_learn_api.settings import DEFAULT_CORS_ORIGINS, Settings

SECRET = "x" * 32


def make(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "database_url": "postgresql+asyncpg://app:app@localhost:5432/app",
        "google_client_id": "client.apps.googleusercontent.com",
        "jwt_secret": SECRET,
        **overrides,
    }
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


def test_defaults() -> None:
    settings = make()

    assert settings.access_token_ttl == timedelta(minutes=15)
    assert settings.refresh_token_ttl == timedelta(days=30)
    assert settings.cors_origins == list(DEFAULT_CORS_ORIGINS)
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
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "id.apps.googleusercontent.com")
    monkeypatch.setenv("JWT_SECRET", SECRET)
    monkeypatch.setenv("ACCESS_TOKEN_TTL", "300")
    monkeypatch.setenv("REFRESH_TOKEN_TTL", "P7D")
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example, https://b.example")

    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.database_url == "postgresql+asyncpg://u:p@h:5432/d"
    assert settings.google_client_id == "id.apps.googleusercontent.com"
    assert settings.access_token_ttl == timedelta(minutes=5)
    assert settings.refresh_token_ttl == timedelta(days=7)
    assert settings.cors_origins == ["https://a.example", "https://b.example"]


@pytest.mark.parametrize("field", ["access_token_ttl", "refresh_token_ttl"])
def test_token_ttls_must_be_positive(field: str) -> None:
    with pytest.raises(ValidationError, match="positive"):
        make(**{field: timedelta(0)})
