"""The HTTP shell every endpoint shares: error model, body limit, CORS, no leaked internals."""

import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any, ClassVar

import httpx
import pytest
from fastapi import FastAPI
from pydantic import BaseModel

from english_learn_api import export_openapi
from english_learn_api.main import create_app
from english_learn_api.shared.errors import DomainError
from tests.support import make_settings


class TeapotError(DomainError):
    code: ClassVar[str] = "teapot"


class Body(BaseModel):
    text: str


def build_app(**overrides: Any) -> FastAPI:
    app = create_app(make_settings(**overrides))

    @app.post("/test/echo")
    async def echo(body: Body) -> Body:
        return body

    @app.get("/test/boom")
    async def boom() -> None:
        msg = "secret internals: password=hunter2"
        raise RuntimeError(msg)

    @app.get("/test/domain-error")
    async def domain_error() -> None:
        msg = "no coffee here"
        raise TeapotError(msg)

    return app


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=build_app(max_request_body_bytes=64))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_unknown_route_uses_the_error_model(client: httpx.AsyncClient) -> None:
    response = await client.get("/nope")

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "not_found", "message": "Not Found"}}


async def test_validation_errors_use_the_error_model(client: httpx.AsyncClient) -> None:
    response = await client.post("/test/echo", json={"wrong": 1})

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "text" in body["error"]["message"]


async def test_unmapped_domain_errors_are_bad_requests(client: httpx.AsyncClient) -> None:
    response = await client.get("/test/domain-error")

    assert response.status_code == 400
    assert response.json() == {"error": {"code": "teapot", "message": "no coffee here"}}


async def test_body_over_the_limit_is_rejected(client: httpx.AsyncClient) -> None:
    response = await client.post("/test/echo", json={"text": "x" * 100})

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


async def test_streamed_body_over_the_limit_is_rejected(client: httpx.AsyncClient) -> None:
    async def chunks() -> AsyncIterator[bytes]:
        yield b'{"text": "'
        yield b"x" * 100
        yield b'"}'

    response = await client.post(
        "/test/echo", content=chunks(), headers={"content-type": "application/json"}
    )

    assert response.status_code == 413


async def test_body_within_the_limit_passes(client: httpx.AsyncClient) -> None:
    response = await client.post("/test/echo", json={"text": "hi"})

    assert response.status_code == 200
    assert response.json() == {"text": "hi"}


async def test_unhandled_errors_hide_internals() -> None:
    transport = httpx.ASGITransport(app=build_app(), raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/test/boom")

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "internal_error", "message": "Internal server error"}
    }
    assert "hunter2" not in response.text


class TestApiDocs:
    @pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
    async def test_are_served_outside_production(self, path: str) -> None:
        transport = httpx.ASGITransport(app=create_app(make_settings()))
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            assert (await client.get(path)).status_code == 200

    @pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
    async def test_are_hidden_in_production(self, path: str) -> None:
        settings = make_settings(env="production", cors_origins=["https://app.example"])
        transport = httpx.ASGITransport(app=create_app(settings))
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(path)

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "not_found"


def test_the_openapi_schema_can_be_exported(tmp_path: Path) -> None:
    target = tmp_path / "openapi.json"

    export_openapi.main([str(target)])

    schema = json.loads(target.read_text())
    assert {"/v1/auth/google", "/v1/auth/refresh", "/v1/me", "/v1/account"} <= set(schema["paths"])


class TestCors:
    ALLOWED: ClassVar[str] = "https://english-learn-iwl.pages.dev"

    async def test_preflight_from_an_allowed_origin(self, client: httpx.AsyncClient) -> None:
        response = await client.options(
            "/test/echo",
            headers={
                "origin": self.ALLOWED,
                "access-control-request-method": "POST",
                "access-control-request-headers": "authorization, content-type",
            },
        )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == self.ALLOWED
        assert "access-control-allow-credentials" not in response.headers

    async def test_other_origins_are_not_allowed(self, client: httpx.AsyncClient) -> None:
        response = await client.post(
            "/test/echo", json={"text": "hi"}, headers={"origin": "https://evil.example"}
        )

        assert "access-control-allow-origin" not in response.headers
