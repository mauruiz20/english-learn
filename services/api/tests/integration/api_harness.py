"""The real app (real Postgres) with a fake Google verifier and a controllable clock."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx

from english_learn_api.main import create_app
from tests.fakes import FakeClock, FakeGoogleVerifier
from tests.support import make_settings


class Api:
    def __init__(self, client: httpx.AsyncClient, clock: FakeClock, google: FakeGoogleVerifier):
        self.client = client
        self.clock = clock
        self.google = google

    async def sign_in(self, id_token: str = "google-ana") -> dict[str, Any]:
        response = await self.client.post("/v1/auth/google", json={"idToken": id_token})
        assert response.status_code == 200, response.text
        body: dict[str, Any] = response.json()
        return body

    async def refresh(self, refresh_token: str) -> httpx.Response:
        return await self.client.post("/v1/auth/refresh", json={"refreshToken": refresh_token})

    async def me(self, access_token: str) -> httpx.Response:
        return await self.client.get("/v1/me", headers=bearer(access_token))


def bearer(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


@asynccontextmanager
async def running_api(database_url: str) -> AsyncIterator[Api]:
    clock = FakeClock()
    google = FakeGoogleVerifier()
    google.register("google-ana", sub="sub-ana", email="ana@example.com")
    app = create_app(make_settings(database_url=database_url), google_verifier=google, clock=clock)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield Api(client, clock, google)
