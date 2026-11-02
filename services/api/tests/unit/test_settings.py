import json
from datetime import timedelta
from ipaddress import ip_network
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from english_learn_api.settings import (
    DEFAULT_CORS_ORIGINS,
    DEFAULT_GOOGLE_CLIENT_IDS,
    DEFAULT_TRANSFER_SOURCE_ORIGINS,
    DatabaseSettings,
    Settings,
)

SECRET = "R7q-v2Lw9_xZpT4mKc8NdYb3HsJf6GaE"
OTHER_SECRET = "Qm2-Xc7_vL9pWz4KtR8bNd3YhS6jFgAe"


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
    assert settings.reauthentication_window == timedelta(minutes=5)
    assert settings.env == "development"
    assert settings.refresh_retry_grace == timedelta(seconds=45)
    assert settings.cors_origins == list(DEFAULT_CORS_ORIGINS)
    assert settings.google_client_ids == list(DEFAULT_GOOGLE_CLIENT_IDS)
    assert settings.refresh_cookie_secure is True
    assert DEFAULT_GOOGLE_CLIENT_IDS == (
        "78200832989-odkefhj0s4vla7h5p83gevs2440mctev.apps.googleusercontent.com",
    )
    assert DEFAULT_CORS_ORIGINS == (
        "https://english.maumar.com.ar",
        "http://localhost:8081",
    )


def test_jwt_secret_must_have_at_least_32_bytes() -> None:
    with pytest.raises(ValidationError, match="at least 32 bytes"):
        make(jwt_secret=SECRET[:31])


def test_jwt_secret_counts_bytes_not_characters() -> None:
    # 16 two-byte characters = 32 bytes (17 distinct byte values).
    secret = "ñáéíóúüçàèìòùâêî"
    assert make(jwt_secret=secret).jwt_signing_keys() == ({"default": secret}, "default")


@pytest.mark.parametrize(
    "secret",
    ["x" * 32, "ab" * 32, "0123456789abcde" * 4, "ñ" * 16],
    ids=["one byte", "two bytes", "15 distinct", "one character"],
)
def test_jwt_secret_rejects_low_entropy(secret: str) -> None:
    with pytest.raises(ValidationError, match="16 distinct bytes"):
        make(jwt_secret=secret)


class TestJwtKeys:
    def test_simple_mode_signs_with_the_default_kid(self) -> None:
        assert make().jwt_signing_keys() == ({"default": SECRET}, "default")

    def test_rotation_mode(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h:5432/d")
        monkeypatch.setenv("JWT_KEYS", json.dumps({"2026-09": OTHER_SECRET, "2026-10": SECRET}))
        monkeypatch.setenv("JWT_ACTIVE_KID", "2026-10")

        settings = Settings(_env_file=None)

        assert settings.jwt_signing_keys() == (
            {"2026-09": OTHER_SECRET, "2026-10": SECRET},
            "2026-10",
        )
        assert SECRET not in repr(settings)

    def test_the_active_kid_must_be_listed(self) -> None:
        with pytest.raises(ValidationError, match="JWT_ACTIVE_KID"):
            make(jwt_secret=None, jwt_keys={"a": SECRET}, jwt_active_kid="b")

    def test_every_key_is_checked(self) -> None:
        with pytest.raises(ValidationError, match="16 distinct bytes"):
            make(jwt_secret=None, jwt_keys={"a": SECRET, "b": "x" * 32}, jwt_active_kid="a")

    def test_needs_exactly_one_mode(self) -> None:
        with pytest.raises(ValidationError, match="either JWT_SECRET or JWT_KEYS"):
            make(jwt_keys={"a": SECRET}, jwt_active_kid="a")
        with pytest.raises(ValidationError, match="either JWT_SECRET or JWT_KEYS"):
            make(jwt_secret=None)


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


class TestProduction:
    def test_requires_explicit_cors_origins(self) -> None:
        with pytest.raises(ValidationError, match="CORS_ORIGINS"):
            make(env="production")

    def test_requires_explicit_cors_origins_from_the_environment(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h:5432/d")
        monkeypatch.setenv("JWT_SECRET", SECRET)
        monkeypatch.setenv("ENV", "production")

        with pytest.raises(ValidationError, match="CORS_ORIGINS"):
            Settings(_env_file=None)

        monkeypatch.setenv("CORS_ORIGINS", "https://english.maumar.com.ar")
        assert Settings(_env_file=None).cors_origins == ["https://english.maumar.com.ar"]

    @pytest.mark.parametrize("origin", ["http://localhost:8081", "http://127.0.0.1:3000", "*"])
    def test_rejects_local_or_wildcard_origins(self, origin: str) -> None:
        with pytest.raises(ValidationError, match="CORS_ORIGINS"):
            make(env="production", cors_origins=["https://english.maumar.com.ar", origin])

    def test_accepts_explicit_https_origins(self) -> None:
        settings = make(env="production", cors_origins=["https://english.maumar.com.ar"])

        assert settings.is_production

    def test_requires_secure_refresh_cookies(self) -> None:
        with pytest.raises(ValidationError, match="REFRESH_COOKIE_SECURE"):
            make(
                env="production",
                cors_origins=["https://english.maumar.com.ar"],
                refresh_cookie_secure=False,
            )


def test_insecure_refresh_cookies_are_allowed_outside_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h:5432/d")
    monkeypatch.setenv("JWT_SECRET", SECRET)
    monkeypatch.setenv("REFRESH_COOKIE_SECURE", "false")

    assert Settings(_env_file=None).refresh_cookie_secure is False


def test_wildcard_cors_origins_are_refused_in_every_environment() -> None:
    # Credentialed CORS with "*" would reflect any origin; origins must be listed exactly.
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        make(cors_origins=["http://localhost:8081", "*"])


def test_env_accepts_only_known_values() -> None:
    with pytest.raises(ValidationError):
        make(env="staging")


class TestClientIpSource:
    def test_defaults_to_the_socket_peer(self) -> None:
        settings = make()

        assert settings.client_ip_source == "socket"
        assert settings.trusted_proxy_cidrs == []

    def test_cloudflare_mode_from_the_environment(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h:5432/d")
        monkeypatch.setenv("JWT_SECRET", SECRET)
        monkeypatch.setenv("CLIENT_IP_SOURCE", "cf-connecting-ip")
        monkeypatch.setenv("TRUSTED_PROXY_CIDRS", "172.18.0.0/16, fd00::/8,10.0.0.7")

        settings = Settings(_env_file=None)

        assert settings.client_ip_source == "cf-connecting-ip"
        assert settings.trusted_proxy_cidrs == [
            ip_network("172.18.0.0/16"),
            ip_network("fd00::/8"),
            ip_network("10.0.0.7/32"),
        ]

    def test_cloudflare_mode_requires_trusted_proxies(self) -> None:
        with pytest.raises(ValidationError, match="TRUSTED_PROXY_CIDRS"):
            make(client_ip_source="cf-connecting-ip")
        with pytest.raises(ValidationError, match="TRUSTED_PROXY_CIDRS"):
            make(client_ip_source="cf-connecting-ip", trusted_proxy_cidrs=" , ")

    @pytest.mark.parametrize("cidrs", ["nope", "172.18.0.1/16", "10.0.0.0/33"])
    def test_rejects_invalid_cidrs(self, cidrs: str) -> None:
        with pytest.raises(ValidationError, match="TRUSTED_PROXY_CIDRS"):
            make(client_ip_source="cf-connecting-ip", trusted_proxy_cidrs=cidrs)

    def test_rejects_unknown_sources(self) -> None:
        with pytest.raises(ValidationError):
            make(client_ip_source="x-forwarded-for")


class TestSecretFiles:
    """Docker secrets: `<NAME>_FILE` points at a file whose content is the value."""

    @pytest.fixture
    def env(self, monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
        for name in ("DATABASE_URL", "JWT_SECRET", "JWT_KEYS", "JWT_ACTIVE_KID"):
            for suffix in ("", "_FILE"):
                monkeypatch.delenv(name + suffix, raising=False)
        return monkeypatch

    @staticmethod
    def secret_file(tmp_path: Path, name: str, content: str | bytes) -> str:
        path = tmp_path / name
        if isinstance(content, bytes):
            path.write_bytes(content)
        else:
            path.write_text(content)
        return str(path)

    def test_reads_values_from_files(self, env: pytest.MonkeyPatch, tmp_path: Path) -> None:
        url = "postgres://app:pw@db:5432/app"
        env.setenv("DATABASE_URL_FILE", self.secret_file(tmp_path, "db", url + "\n"))
        env.setenv("JWT_SECRET_FILE", self.secret_file(tmp_path, "jwt", SECRET + "\r\n"))

        settings = Settings(_env_file=None)

        assert settings.database_url == "postgresql+asyncpg://app:pw@db:5432/app"
        assert settings.jwt_signing_keys() == ({"default": SECRET}, "default")

    def test_reads_jwt_keys_from_a_file(self, env: pytest.MonkeyPatch, tmp_path: Path) -> None:
        keys = json.dumps({"2026-09": OTHER_SECRET, "2026-10": SECRET})
        env.setenv("DATABASE_URL", "postgresql://u:p@h:5432/d")
        env.setenv("JWT_KEYS_FILE", self.secret_file(tmp_path, "keys", keys + "\n"))
        env.setenv("JWT_ACTIVE_KID", "2026-10")

        settings = Settings(_env_file=None)

        assert settings.jwt_signing_keys() == (
            {"2026-09": OTHER_SECRET, "2026-10": SECRET},
            "2026-10",
        )

    def test_migrations_read_the_database_url_from_a_file(
        self, env: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        env.setenv("DATABASE_URL_FILE", self.secret_file(tmp_path, "db", "postgres://u:p@h/d\n"))

        assert DatabaseSettings(_env_file=None).database_url == "postgresql+asyncpg://u:p@h/d"

    def test_refuses_both_the_variable_and_its_file(
        self, env: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        env.setenv("DATABASE_URL", "postgresql://u:p@h:5432/d")
        env.setenv("JWT_SECRET", SECRET)
        env.setenv("JWT_SECRET_FILE", self.secret_file(tmp_path, "jwt", OTHER_SECRET))

        with pytest.raises(ValueError, match="JWT_SECRET or JWT_SECRET_FILE, not both") as error:
            Settings(_env_file=None)
        assert SECRET not in str(error.value)
        assert OTHER_SECRET not in str(error.value)

    def test_refuses_a_missing_file(self, env: pytest.MonkeyPatch, tmp_path: Path) -> None:
        env.setenv("DATABASE_URL", "postgresql://u:p@h:5432/d")
        env.setenv("JWT_SECRET_FILE", str(tmp_path / "absent"))

        with pytest.raises(ValueError, match="JWT_SECRET_FILE: cannot read"):
            Settings(_env_file=None)

    @pytest.mark.parametrize("content", ["", "\n", "\r\n\n"])
    def test_refuses_an_empty_file(
        self, env: pytest.MonkeyPatch, tmp_path: Path, content: str
    ) -> None:
        env.setenv("DATABASE_URL_FILE", self.secret_file(tmp_path, "db", content))
        env.setenv("JWT_SECRET", SECRET)

        with pytest.raises(ValueError, match=r"DATABASE_URL_FILE: .* is empty"):
            Settings(_env_file=None)

    def test_refuses_a_file_that_is_not_text(self, env: pytest.MonkeyPatch, tmp_path: Path) -> None:
        env.setenv("DATABASE_URL", "postgresql://u:p@h:5432/d")
        env.setenv("JWT_SECRET_FILE", self.secret_file(tmp_path, "jwt", b"\xff\xfe" + b"a" * 40))

        with pytest.raises(ValueError, match=r"JWT_SECRET_FILE: .* not UTF-8"):
            Settings(_env_file=None)

    def test_invalid_json_keys_never_echo_the_file(
        self, env: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        env.setenv("DATABASE_URL", "postgresql://u:p@h:5432/d")
        env.setenv("JWT_KEYS_FILE", self.secret_file(tmp_path, "keys", f"{{'a': '{SECRET}'}}"))
        env.setenv("JWT_ACTIVE_KID", "a")

        with pytest.raises(ValueError, match=r"JWT_KEYS_FILE: .* not valid JSON") as error:
            Settings(_env_file=None)
        assert SECRET not in str(error.value)

    def test_a_weak_secret_from_a_file_is_refused_without_echoing_it(
        self, env: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        weak = "x" * 40
        env.setenv("DATABASE_URL", "postgresql://u:p@h:5432/d")
        env.setenv("JWT_SECRET_FILE", self.secret_file(tmp_path, "jwt", weak))

        with pytest.raises(ValidationError, match="16 distinct bytes") as error:
            Settings(_env_file=None)
        assert weak not in str(error.value)

    def test_an_invalid_database_url_is_refused_without_echoing_it(
        self, env: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        url = "mysql://app:hunter2-password@db/app"
        env.setenv("DATABASE_URL_FILE", self.secret_file(tmp_path, "db", url))
        env.setenv("JWT_SECRET", SECRET)

        with pytest.raises(ValidationError, match="PostgreSQL") as error:
            Settings(_env_file=None)
        assert "hunter2" not in str(error.value)


class TestTransferSourceOrigins:
    """Origins allowed to create progress transfers (the old site); the app's own claim them."""

    def test_default_to_the_old_pages_dev_site(self) -> None:
        assert make().transfer_source_origins == ["https://english-learn-iwl.pages.dev"]
        assert DEFAULT_TRANSFER_SOURCE_ORIGINS == ("https://english-learn-iwl.pages.dev",)

    def test_are_read_comma_separated(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h:5432/d")
        monkeypatch.setenv("JWT_SECRET", SECRET)
        monkeypatch.setenv("TRANSFER_SOURCE_ORIGINS", "https://old.example, http://localhost:4174")

        settings = Settings(_env_file=None)

        assert settings.transfer_source_origins == [
            "https://old.example",
            "http://localhost:4174",
        ]

    def test_refuse_a_wildcard_in_every_environment(self) -> None:
        with pytest.raises(ValidationError, match="TRANSFER_SOURCE_ORIGINS"):
            make(transfer_source_origins=["*"])

    @pytest.mark.parametrize("origin", ["http://localhost:4174", "http://old.example"])
    def test_must_be_public_https_in_production(self, origin: str) -> None:
        with pytest.raises(ValidationError, match="TRANSFER_SOURCE_ORIGINS"):
            make(
                env="production",
                cors_origins=["https://english.maumar.com.ar"],
                transfer_source_origins=[origin],
            )

    def test_the_default_is_valid_in_production(self) -> None:
        settings = make(env="production", cors_origins=["https://english.maumar.com.ar"])

        assert settings.transfer_source_origins == ["https://english-learn-iwl.pages.dev"]
