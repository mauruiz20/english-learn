"""Rate limits and the cap on concurrent Google verifications, through the real app."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta

import httpx
import pytest

from english_learn_api.auth.domain.models import GoogleIdentity
from english_learn_api.main import create_app
from tests.fakes import FakeClock, FakeGoogleVerifier
from tests.integration.api_harness import bearer
from tests.support import make_settings


@asynccontextmanager
async def client_from(app: object, ip: str = "203.0.113.1") -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app, client=(ip, 50000))  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def google() -> FakeGoogleVerifier:
    google = FakeGoogleVerifier()
    google.register("google-ana", sub="sub-ana", email="ana@example.com")
    return google


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def app(database_url: str, google: FakeGoogleVerifier, clock: FakeClock) -> object:
    return create_app(make_settings(database_url=database_url), google_verifier=google, clock=clock)


def assert_rate_limited(response: httpx.Response) -> None:
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"
    assert int(response.headers["retry-after"]) >= 1


async def test_google_sign_in_allows_ten_per_minute_per_ip(app: object) -> None:
    async with client_from(app) as client, client_from(app, ip="198.51.100.7") as other:
        statuses = [
            (await client.post("/v1/auth/google", json={"idToken": "forged"})).status_code
            for _ in range(10)
        ]
        limited = await client.post("/v1/auth/google", json={"idToken": "google-ana"})
        elsewhere = await other.post("/v1/auth/google", json={"idToken": "google-ana"})

    assert statuses == [401] * 10
    assert_rate_limited(limited)
    assert int(limited.headers["retry-after"]) == 6
    assert elsewhere.status_code == 200


@pytest.mark.parametrize("path", ["/v1/auth/refresh", "/v1/auth/logout"])
async def test_refresh_and_logout_allow_thirty_per_minute_per_ip(app: object, path: str) -> None:
    async with client_from(app) as client:
        for _ in range(30):
            response = await client.post(path, json={"refreshToken": "unknown"})
            assert response.status_code != 429
        limited = await client.post(path, json={"refreshToken": "unknown"})

    assert_rate_limited(limited)


async def test_account_deletion_allows_five_attempts_per_hour_per_user(
    app: object, clock: FakeClock
) -> None:
    async with client_from(app) as client:
        signed_in = (await client.post("/v1/auth/google", json={"idToken": "google-ana"})).json()
        clock.advance(timedelta(minutes=10))  # too old to delete: every attempt is a 401
        headers = bearer(signed_in["accessToken"])
        attempts = [(await client.delete("/v1/account", headers=headers)) for _ in range(5)]
        limited = await client.delete("/v1/account", headers=headers)

    assert [a.json()["error"]["code"] for a in attempts] == ["reauthentication_required"] * 5
    assert_rate_limited(limited)
    assert int(limited.headers["retry-after"]) == 720  # one attempt every 12 minutes


async def test_sync_allows_sixty_per_minute_per_user(app: object) -> None:
    async with client_from(app) as client:
        ana = (await client.post("/v1/auth/google", json={"idToken": "google-ana"})).json()
        statuses = [
            (await client.post("/v1/sync", json={}, headers=bearer(ana["accessToken"])))
            for _ in range(60)
        ]
        limited = await client.post("/v1/sync", json={}, headers=bearer(ana["accessToken"]))
        unauthenticated = await client.post("/v1/sync", json={})

    assert {s.status_code for s in statuses} == {422}  # counted before the body is validated
    assert_rate_limited(limited)
    assert int(limited.headers["retry-after"]) == 1
    assert unauthenticated.status_code == 401


async def test_the_sync_limit_is_per_user_not_per_address(
    app: object, google: FakeGoogleVerifier
) -> None:
    google.register("google-ben", sub="sub-ben", email="ben@example.com")
    async with client_from(app) as client:  # both users behind the same address
        ana = (await client.post("/v1/auth/google", json={"idToken": "google-ana"})).json()
        ben = (await client.post("/v1/auth/google", json={"idToken": "google-ben"})).json()
        for _ in range(60):
            await client.post("/v1/sync", json={}, headers=bearer(ana["accessToken"]))
        ana_limited = await client.post("/v1/sync", json={}, headers=bearer(ana["accessToken"]))
        ben_allowed = await client.post(
            "/v1/sync",
            json={"deviceId": "6f1c2a4e-0b1d-4c2e-9f3a-5b6c7d8e9f01", "cursor": None, "events": []},
            headers=bearer(ben["accessToken"]),
        )

    assert_rate_limited(ana_limited)
    assert ben_allowed.status_code == 200


class TestBehindCloudflareTunnel:
    PROXY = "172.18.0.5"  # cloudflared, the only peer uvicorn sees

    @pytest.fixture
    def app(self, database_url: str, google: FakeGoogleVerifier, clock: FakeClock) -> object:
        settings = make_settings(
            database_url=database_url,
            client_ip_source="cf-connecting-ip",
            trusted_proxy_cidrs="172.18.0.0/16",
        )
        return create_app(settings, google_verifier=google, clock=clock)

    @staticmethod
    async def sign_ins(client: httpx.AsyncClient, cf_ip: str, count: int) -> list[int]:
        headers = {"CF-Connecting-IP": cf_ip}
        return [
            (
                await client.post("/v1/auth/google", json={"idToken": "x"}, headers=headers)
            ).status_code
            for _ in range(count)
        ]

    async def test_clients_behind_the_same_proxy_get_separate_buckets(self, app: object) -> None:
        async with client_from(app, ip=self.PROXY) as tunnel:
            first = await self.sign_ins(tunnel, "198.51.100.7", 11)
            second = await self.sign_ins(tunnel, "2001:db8::7", 10)

        assert first == [401] * 10 + [429]
        assert second == [401] * 10

    async def test_an_untrusted_peer_cannot_pick_its_bucket(self, app: object) -> None:
        async with client_from(app, ip="203.0.113.9") as direct:
            statuses = [
                (await self.sign_ins(direct, f"198.51.100.{n}", 1))[0] for n in range(1, 12)
            ]

        assert statuses == [401] * 10 + [429]

    @pytest.mark.parametrize("path", ["/v1/auth/refresh", "/v1/auth/logout"])
    async def test_refresh_and_logout_use_the_same_client_address(
        self, app: object, path: str
    ) -> None:
        async with client_from(app, ip=self.PROXY) as tunnel:
            for _ in range(30):
                await tunnel.post(
                    path, json={"refreshToken": "unknown"}, headers={"CF-Connecting-IP": "1.2.3.4"}
                )
            limited = await tunnel.post(
                path, json={"refreshToken": "unknown"}, headers={"CF-Connecting-IP": "1.2.3.4"}
            )
            other = await tunnel.post(
                path, json={"refreshToken": "unknown"}, headers={"CF-Connecting-IP": "5.6.7.8"}
            )

        assert_rate_limited(limited)
        assert other.status_code != 429


async def test_google_verification_is_capped_and_busy_beyond_a_short_wait(
    database_url: str,
) -> None:
    class Stalled:
        def __init__(self) -> None:
            self.release = asyncio.Event()

        async def verify(self, id_token: str) -> GoogleIdentity:
            await self.release.wait()
            return GoogleIdentity(sub="sub-ana", email="ana@example.com")

    stalled = Stalled()
    app = create_app(
        make_settings(database_url=database_url),
        google_verifier=stalled,
        google_concurrency=(1, 0.05),
    )
    async with client_from(app) as client, client_from(app, ip="198.51.100.7") as other:
        first = asyncio.create_task(client.post("/v1/auth/google", json={"idToken": "a"}))
        await asyncio.sleep(0.05)
        busy = await other.post("/v1/auth/google", json={"idToken": "b"})
        stalled.release.set()
        assert (await first).status_code == 200

    assert busy.status_code == 503
    assert busy.json()["error"]["code"] == "google_busy"
