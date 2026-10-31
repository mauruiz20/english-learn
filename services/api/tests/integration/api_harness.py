"""The real app (real Postgres) with a fake Google verifier and a controllable clock."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx

from english_learn_api.main import create_app
from tests.fakes import FakeClock, FakeGoogleVerifier
from tests.support import make_settings

API_BASE_URL = "https://english-api.maumar.com.ar"  # https, so the client keeps Secure cookies
WEB_ORIGIN = "https://english.maumar.com.ar"
REFRESH_COOKIE = "el_rt"
# What the web client sends on cookie-authenticated calls (CSRF defense: Origin + custom header).
COOKIE_HEADERS = {
    "X-Token-Transport": "cookie",
    "X-Requested-With": "english-learn",
    "Origin": WEB_ORIGIN,
}


class Api:
    def __init__(
        self, client: httpx.AsyncClient, clock: FakeClock, google: FakeGoogleVerifier
    ) -> None:
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

    async def cookie_sign_in(self, id_token: str = "google-ana") -> httpx.Response:
        response = await self.client.post(
            "/v1/auth/google",
            json={"idToken": id_token, "nonce": f"nonce-{id_token}"},
            headers=COOKIE_HEADERS,
        )
        assert response.status_code == 200, response.text
        return response

    async def cookie_refresh(self, cookie: str | None = None) -> httpx.Response:
        """Refresh in cookie mode: with the jar's cookie, or exactly `cookie` when given."""
        return await self.client.post(
            "/v1/auth/refresh", headers=COOKIE_HEADERS | cookie_header(cookie)
        )

    async def cookie_logout(self, cookie: str | None = None) -> httpx.Response:
        return await self.client.post(
            "/v1/auth/logout", headers=COOKIE_HEADERS | cookie_header(cookie)
        )

    async def me(self, access_token: str) -> httpx.Response:
        return await self.client.get("/v1/me", headers=bearer(access_token))


def cookie_header(cookie: str | None) -> dict[str, str]:
    """An explicit Cookie header; httpx then leaves the jar's cookies out of the request."""
    return {} if cookie is None else {"Cookie": f"{REFRESH_COOKIE}={cookie}"}


def set_cookie_headers(response: httpx.Response) -> list[str]:
    return response.headers.get_list("set-cookie")


def bearer(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


@asynccontextmanager
async def running_api(database_url: str) -> AsyncIterator[Api]:
    clock = FakeClock()
    google = FakeGoogleVerifier()
    google.register("google-ana", sub="sub-ana", email="ana@example.com", nonce="nonce-google-ana")
    app = create_app(make_settings(database_url=database_url), google_verifier=google, clock=clock)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=API_BASE_URL) as client:
        yield Api(client, clock, google)
