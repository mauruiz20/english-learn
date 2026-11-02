"""Transfer routes' HTTP shell without a database: per-route CORS and the larger body limit."""

import json
from collections.abc import AsyncIterator
from typing import Any, ClassVar

import httpx
import pytest

from english_learn_api.main import create_app
from tests.support import make_settings

OLD_SITE = "https://english-learn-iwl.pages.dev"
APP = "https://english.maumar.com.ar"
FOREIGN = "https://evil.example"


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=create_app(make_settings()))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def preflight(
    client: httpx.AsyncClient, path: str, origin: str, headers: str = "content-type"
) -> httpx.Response:
    return await client.options(
        path,
        headers={
            "origin": origin,
            "access-control-request-method": "POST",
            "access-control-request-headers": headers,
        },
    )


def allowed_headers(response: httpx.Response) -> set[str]:
    return {h.strip().lower() for h in response.headers["access-control-allow-headers"].split(",")}


class TestCors:
    @pytest.mark.parametrize("origin", [OLD_SITE, APP])
    async def test_create_accepts_the_old_site_and_the_app(
        self, client: httpx.AsyncClient, origin: str
    ) -> None:
        response = await preflight(client, "/v1/transfers", origin)

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
        assert "access-control-allow-credentials" not in response.headers
        assert "content-type" in allowed_headers(response)
        assert "POST" in response.headers["access-control-allow-methods"]

    async def test_claim_accepts_only_the_app(self, client: httpx.AsyncClient) -> None:
        app = await preflight(client, "/v1/transfers/claim", APP)
        old = await preflight(client, "/v1/transfers/claim", OLD_SITE)

        assert app.status_code == 200
        assert app.headers["access-control-allow-origin"] == APP
        assert "access-control-allow-credentials" not in app.headers
        assert old.status_code == 400
        assert "access-control-allow-origin" not in old.headers

    @pytest.mark.parametrize("path", ["/v1/transfers", "/v1/transfers/claim"])
    async def test_foreign_origins_are_refused(self, client: httpx.AsyncClient, path: str) -> None:
        response = await preflight(client, path, FOREIGN)

        assert response.status_code == 400
        assert "access-control-allow-origin" not in response.headers

    async def test_transfer_routes_do_not_accept_credential_headers(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await preflight(client, "/v1/transfers", OLD_SITE, "authorization")

        assert response.status_code == 400

    async def test_the_old_site_gets_no_cors_on_the_credentialed_routes(
        self, client: httpx.AsyncClient
    ) -> None:
        sync = await preflight(client, "/v1/sync", OLD_SITE, "authorization, content-type")
        refresh = await preflight(client, "/v1/auth/refresh", APP, "x-token-transport")

        assert sync.status_code == 400
        assert "access-control-allow-origin" not in sync.headers
        assert refresh.status_code == 200
        assert refresh.headers["access-control-allow-origin"] == APP
        assert refresh.headers["access-control-allow-credentials"] == "true"

    async def test_simple_responses_name_the_allowed_origin_without_credentials(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.post("/v1/transfers", json={}, headers={"origin": OLD_SITE})

        assert response.status_code == 422
        assert response.headers["access-control-allow-origin"] == OLD_SITE
        assert "access-control-allow-credentials" not in response.headers


class TestBodyLimit:
    MIB: ClassVar[int] = 1024 * 1024

    @staticmethod
    def padded(size: int) -> bytes:
        body: dict[str, Any] = {"events": [], "padding": ""}
        body["padding"] = "x" * (size - len(json.dumps(body)))
        return json.dumps(body).encode()

    async def test_create_accepts_bodies_up_to_two_mib(self, client: httpx.AsyncClient) -> None:
        response = await client.post(
            "/v1/transfers",
            content=self.padded(2 * self.MIB - 100),
            headers={"content-type": "application/json", "origin": OLD_SITE},
        )

        assert response.status_code == 422  # read and validated, not cut off

    async def test_create_refuses_bodies_over_two_mib(self, client: httpx.AsyncClient) -> None:
        response = await client.post(
            "/v1/transfers",
            content=self.padded(2 * self.MIB + 1),
            headers={"content-type": "application/json", "origin": OLD_SITE},
        )

        assert response.status_code == 413
        assert response.json()["error"]["code"] == "payload_too_large"
        # The old site can read the 413 and explain it.
        assert response.headers["access-control-allow-origin"] == OLD_SITE

    @pytest.mark.parametrize("path", ["/v1/sync", "/v1/transfers/claim"])
    async def test_other_routes_keep_the_one_mib_limit(
        self, client: httpx.AsyncClient, path: str
    ) -> None:
        response = await client.post(
            path, content=self.padded(self.MIB + 100), headers={"content-type": "application/json"}
        )

        assert response.status_code == 413
