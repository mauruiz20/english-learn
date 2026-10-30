"""Database errors must not leak query parameters (emails, token hashes) into the logs."""

import logging

import httpx
import pytest

from english_learn_api.main import create_app
from english_learn_api.shared.logging import JsonFormatter
from tests.fakes import FakeGoogleVerifier
from tests.support import make_settings


async def test_a_database_error_log_line_does_not_contain_the_email(
    database_url: str, caplog: pytest.LogCaptureFixture
) -> None:
    google = FakeGoogleVerifier()
    # PostgreSQL rejects NUL characters in text, so the INSERT of this email fails.
    google.register("google-nul", sub="sub-nul", email="leak-check\x00@example.com")
    app = create_app(make_settings(database_url=database_url), google_verifier=google)
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    caplog.set_level(logging.ERROR)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/v1/auth/google", json={"idToken": "google-nul"})

    assert response.status_code == 500
    lines = [JsonFormatter().format(record) for record in caplog.records]
    assert any("unhandled error" in line for line in lines)
    assert not [line for line in lines if "leak-check" in line]
