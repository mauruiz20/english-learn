"""Helpers shared by unit and integration tests."""

from typing import Any

from english_learn_api.settings import Settings

TEST_JWT_SECRET = "test-secret-with-at-least-32-bytes!!"
TEST_GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com"


def make_settings(
    database_url: str = "postgresql+asyncpg://app:app@127.0.0.1:1/unused",
    **overrides: Any,
) -> Settings:
    values: dict[str, Any] = {
        "database_url": database_url,
        "google_client_id": TEST_GOOGLE_CLIENT_ID,
        "jwt_secret": TEST_JWT_SECRET,
        **overrides,
    }
    return Settings(_env_file=None, **values)
