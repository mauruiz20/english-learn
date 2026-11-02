"""Transfer routes' HTTP shell without a database: per-route CORS, the larger body limit, and the
admission (rate limits, concurrency) that runs before any body is read."""

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Any, ClassVar

import httpx
import pytest
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from english_learn_api.main import RateLimits, create_app
from english_learn_api.shared.rate_limit import Rate
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


class BodySpy:
    """Wraps the app and records whether any request body was handed to it."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.read = False

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        async def spying_receive() -> Message:
            message = await receive()
            if message["type"] == "http.request" and message.get("body"):
                self.read = True
            return message

        await self.app(scope, spying_receive, send)


def spied_app(**kwargs: Any) -> BodySpy:
    return BodySpy(create_app(make_settings(), **kwargs))


@asynccontextmanager
async def client_at(app: ASGIApp, ip: str) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app, client=(ip, 50000))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


MALFORMED_2_MIB = b"{" + b"x" * (2 * 1024 * 1024 - 10)
JSON = {"content-type": "application/json", "origin": OLD_SITE}
ONE_PER_HOUR = Rate(1, timedelta(hours=1))


class TestAdmission:
    async def test_an_address_over_its_create_limit_is_refused_before_the_body_is_read(
        self,
    ) -> None:
        spy = spied_app(rate_limits=RateLimits(create_transfer=ONE_PER_HOUR))
        async with client_at(spy, "203.0.113.1") as client:
            first = await client.post("/v1/transfers", json={}, headers={"origin": OLD_SITE})
            spy.read = False
            limited = await client.post("/v1/transfers", content=MALFORMED_2_MIB, headers=JSON)

        assert first.status_code == 422
        assert limited.status_code == 429
        assert limited.json()["error"]["code"] == "rate_limited"
        assert int(limited.headers["retry-after"]) >= 1
        assert limited.headers["access-control-allow-origin"] == OLD_SITE
        assert spy.read is False

    async def test_an_address_over_its_claim_limit_is_refused_before_the_body_is_read(
        self,
    ) -> None:
        spy = spied_app(rate_limits=RateLimits(claim_transfer=ONE_PER_HOUR))
        headers = {"content-type": "application/json", "origin": APP}
        async with client_at(spy, "203.0.113.1") as client:
            first = await client.post("/v1/transfers/claim", content=b"{", headers=headers)
            spy.read = False
            limited = await client.post("/v1/transfers/claim", content=b"{" * 1000, headers=headers)

        assert first.status_code == 422
        assert limited.status_code == 429
        assert limited.headers["access-control-allow-origin"] == APP
        assert spy.read is False

    async def test_addresses_of_one_ipv6_64_share_a_limit(self) -> None:
        app = create_app(make_settings(), rate_limits=RateLimits(create_transfer=ONE_PER_HOUR))
        statuses = []
        for ip in ("2001:db8:1:2::1", "2001:db8:1:2:ffff::9", "2001:db8:1:3::1"):
            async with client_at(app, ip) as client:
                statuses.append((await client.post("/v1/transfers", json={})).status_code)

        assert statuses == [422, 429, 422]

    async def test_creates_over_the_global_limit_get_503_transfer_capacity(self) -> None:
        spy = spied_app(rate_limits=RateLimits(create_transfer_global=Rate(2, timedelta(hours=1))))
        statuses = []
        for n in range(3):
            async with client_at(spy, f"203.0.113.{n + 1}") as client:
                spy.read = False
                response = await client.post("/v1/transfers", content=MALFORMED_2_MIB, headers=JSON)
                statuses.append(response.status_code)

        assert statuses == [422, 422, 503]
        assert response.json()["error"]["code"] == "transfer_capacity"
        assert int(response.headers["retry-after"]) >= 1
        assert response.headers["access-control-allow-origin"] == OLD_SITE
        assert spy.read is False

    async def test_creates_beyond_the_concurrency_cap_get_503_busy(self) -> None:
        app = create_app(make_settings(), transfer_concurrency=(1, 0.05))
        reading = asyncio.Event()
        finish = asyncio.Event()

        async def slow_body() -> AsyncIterator[bytes]:
            yield b'{"events": '
            reading.set()  # the app is reading this body, so it holds the only slot
            await finish.wait()
            yield b"[]}"

        async with (
            client_at(app, "203.0.113.1") as first_client,
            client_at(app, "203.0.113.2") as second_client,
        ):
            first = asyncio.create_task(
                first_client.post("/v1/transfers", content=slow_body(), headers=JSON)
            )
            await reading.wait()
            busy = await second_client.post("/v1/transfers", json={}, headers=JSON)
            finish.set()
            done = await first
            after = await second_client.post("/v1/transfers", json={}, headers=JSON)

        assert busy.status_code == 503
        assert busy.json()["error"]["code"] == "busy"
        assert busy.headers["access-control-allow-origin"] == OLD_SITE
        assert done.status_code == 422
        assert after.status_code == 422  # the slot came back
