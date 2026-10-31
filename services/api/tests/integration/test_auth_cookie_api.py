"""Cookie token transport (`X-Token-Transport: cookie`): the web app's refresh token lives in an
HttpOnly cookie that JavaScript cannot read. Body mode is covered by test_auth_api.py."""

from collections.abc import AsyncIterator
from datetime import timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.integration.api_harness import (
    COOKIE_HEADERS,
    REFRESH_COOKIE,
    WEB_ORIGIN,
    Api,
    running_api,
    set_cookie_headers,
)

ATTRIBUTES = "HttpOnly; Secure; SameSite=Strict; Path=/v1/auth"
CLEARED = f"{REFRESH_COOKIE}=; {ATTRIBUTES}; Max-Age=0"
FOURTEEN_DAYS = 14 * 24 * 3600


@pytest.fixture
async def api(database_url: str) -> AsyncIterator[Api]:
    async with running_api(database_url) as api:
        yield api


def issued_cookie(set_cookie: list[str]) -> tuple[str, str]:
    """The token and the attributes of the one refresh cookie a response sets."""
    assert len(set_cookie) == 1, set_cookie
    pair, _, attributes = set_cookie[0].partition("; ")
    name, _, value = pair.partition("=")
    assert name == REFRESH_COOKIE
    assert value
    return value, attributes


async def live_tokens(engine: AsyncEngine) -> int:
    async with engine.connect() as connection:
        sql = "SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL"
        return int(await connection.scalar(text(sql)) or 0)


class TestSignIn:
    async def test_sets_the_refresh_cookie_and_omits_the_token_from_json(self, api: Api) -> None:
        response = await api.cookie_sign_in()

        body = response.json()
        assert set(body) == {"accessToken", "accessTokenExpiresAt", "user"}
        _, attributes = issued_cookie(set_cookie_headers(response))
        assert attributes == f"{ATTRIBUTES}; Max-Age={FOURTEEN_DAYS}"
        assert "domain" not in attributes.lower()  # host-only
        assert api.client.cookies.get(REFRESH_COOKIE)  # kept by an https client

    async def test_max_age_follows_the_absolute_session_end(self, api: Api) -> None:
        token, _ = issued_cookie(set_cookie_headers(await api.cookie_sign_in()))
        attributes = ""
        for _ in range(5):  # every 10 days: within the 14-day idle timeout
            api.clock.advance(timedelta(days=10))
            refreshed = await api.cookie_refresh(token)
            token, attributes = issued_cookie(set_cookie_headers(refreshed))

        # Signed in at T0, now T0 + 50 days: the session ends at T0 + 60 days.
        assert attributes.endswith(f"Max-Age={10 * 24 * 3600}")

    async def test_body_mode_stays_the_default(self, api: Api) -> None:
        response = await api.client.post("/v1/auth/google", json={"idToken": "google-ana"})

        assert "refreshToken" in response.json()
        assert set_cookie_headers(response) == []

    async def test_an_explicit_body_transport_returns_json_only(self, api: Api) -> None:
        response = await api.client.post(
            "/v1/auth/google", json={"idToken": "google-ana"}, headers={"X-Token-Transport": "body"}
        )

        assert "refreshToken" in response.json()
        assert set_cookie_headers(response) == []

    async def test_rejects_an_unknown_transport(self, api: Api) -> None:
        response = await api.client.post(
            "/v1/auth/google", json={"idToken": "google-ana"}, headers={"X-Token-Transport": "jar"}
        )

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


class TestRefresh:
    async def test_rotates_through_the_cookie(self, api: Api) -> None:
        first, _ = issued_cookie(set_cookie_headers(await api.cookie_sign_in()))
        api.clock.advance(timedelta(minutes=20))

        response = await api.cookie_refresh()  # the jar sends the cookie (Path=/v1/auth)

        assert response.status_code == 200, response.text
        assert set(response.json()) == {"accessToken", "accessTokenExpiresAt"}
        second, attributes = issued_cookie(set_cookie_headers(response))
        assert second != first
        assert attributes == f"{ATTRIBUTES}; Max-Age={FOURTEEN_DAYS}"
        assert api.client.cookies.get(REFRESH_COOKIE) == second
        assert (await api.me(response.json()["accessToken"])).status_code == 200

    async def test_reuse_of_an_old_cookie_revokes_the_family_and_clears_it(
        self, api: Api, engine: AsyncEngine
    ) -> None:
        old, _ = issued_cookie(set_cookie_headers(await api.cookie_sign_in()))
        await api.cookie_refresh(old)
        api.clock.advance(timedelta(seconds=45))

        reused = await api.cookie_refresh(old)

        assert reused.status_code == 401
        assert reused.json()["error"]["code"] == "refresh_token_reused"
        assert set_cookie_headers(reused) == [CLEARED]
        assert await live_tokens(engine) == 0

    async def test_a_lost_response_is_retried_with_the_old_cookie(
        self, api: Api, engine: AsyncEngine
    ) -> None:
        old, _ = issued_cookie(set_cookie_headers(await api.cookie_sign_in()))
        await api.cookie_refresh(old)  # Set-Cookie never reached the browser
        api.clock.advance(timedelta(seconds=44))

        retried = await api.cookie_refresh(old)  # so the browser re-sends the old cookie

        assert retried.status_code == 200, retried.text
        new, _ = issued_cookie(set_cookie_headers(retried))
        assert await live_tokens(engine) == 1
        assert (await api.cookie_refresh(new)).status_code == 200

    @pytest.mark.parametrize("cookie", [None, "unknown"], ids=["missing", "unknown"])
    async def test_an_invalid_cookie_is_rejected_and_cleared(
        self, api: Api, cookie: str | None
    ) -> None:
        response = await api.cookie_refresh(cookie)

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "invalid_refresh_token"
        assert set_cookie_headers(response) == [CLEARED]

    async def test_an_expired_cookie_is_rejected_and_cleared(self, api: Api) -> None:
        token, _ = issued_cookie(set_cookie_headers(await api.cookie_sign_in()))
        api.clock.advance(timedelta(days=14))

        response = await api.cookie_refresh(token)

        assert response.status_code == 401
        assert set_cookie_headers(response) == [CLEARED]

    async def test_ignores_a_refresh_token_in_the_body(self, api: Api) -> None:
        body_token = (await api.sign_in())["refreshToken"]

        response = await api.client.post(
            "/v1/auth/refresh", json={"refreshToken": body_token}, headers=COOKIE_HEADERS
        )

        assert response.status_code == 401  # no cookie: the body is never read in cookie mode
        assert (await api.refresh(body_token)).status_code == 200

    async def test_body_mode_still_requires_the_body(self, api: Api) -> None:
        response = await api.client.post("/v1/auth/refresh")

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


class TestLogout:
    async def test_revokes_the_session_and_clears_the_cookie(
        self, api: Api, engine: AsyncEngine
    ) -> None:
        token, _ = issued_cookie(set_cookie_headers(await api.cookie_sign_in()))

        response = await api.cookie_logout(token)

        assert response.status_code == 204
        assert set_cookie_headers(response) == [CLEARED]
        assert await live_tokens(engine) == 0
        assert (await api.cookie_refresh(token)).status_code == 401

    async def test_without_a_cookie_still_clears_it(self, api: Api) -> None:
        response = await api.cookie_logout()

        assert response.status_code == 204
        assert set_cookie_headers(response) == [CLEARED]


class TestCsrf:
    @pytest.mark.parametrize("path", ["/v1/auth/refresh", "/v1/auth/logout"])
    @pytest.mark.parametrize(
        "headers",
        [
            {"X-Requested-With": None},
            {"X-Requested-With": "XMLHttpRequest"},
            {"Origin": None},
            {"Origin": "https://evil.example"},
            {"Origin": "null"},
        ],
        ids=["no-x-requested-with", "other-x-requested-with", "no-origin", "foreign", "null"],
    )
    async def test_rejects_requests_without_the_custom_header_and_an_allowed_origin(
        self, api: Api, engine: AsyncEngine, path: str, headers: dict[str, str | None]
    ) -> None:
        await api.cookie_sign_in()  # the jar holds a valid cookie
        sent = {
            name: value for name, value in (COOKIE_HEADERS | headers).items() if value is not None
        }

        response = await api.client.post(path, headers=sent)

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "csrf_rejected"
        assert set_cookie_headers(response) == []
        assert await live_tokens(engine) == 1

    async def test_body_mode_needs_no_csrf_headers(self, api: Api) -> None:
        token = (await api.sign_in())["refreshToken"]

        response = await api.client.post("/v1/auth/refresh", json={"refreshToken": token})

        assert response.status_code == 200


class TestCors:
    async def test_preflight_from_the_web_app_allows_credentials(self, api: Api) -> None:
        response = await api.client.options(
            "/v1/auth/refresh",
            headers={
                "Origin": WEB_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "x-token-transport, x-requested-with",
            },
        )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == WEB_ORIGIN
        assert response.headers["access-control-allow-credentials"] == "true"

    async def test_preflight_from_another_origin_is_rejected(self, api: Api) -> None:
        response = await api.client.options(
            "/v1/auth/refresh",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "x-token-transport, x-requested-with",
            },
        )

        assert response.status_code == 400
        # Without Access-Control-Allow-Origin the browser blocks the request. (Starlette still
        # sends Access-Control-Allow-Credentials on preflights; alone it grants nothing.)
        assert "access-control-allow-origin" not in response.headers

    async def test_credentialed_responses_name_the_exact_origin(self, api: Api) -> None:
        response = await api.cookie_sign_in()

        assert response.headers["access-control-allow-origin"] == WEB_ORIGIN
        assert response.headers["access-control-allow-credentials"] == "true"
