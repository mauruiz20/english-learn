from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.fakes import T0
from tests.integration.api_harness import Api, running_api


@pytest.fixture
async def api(database_url: str) -> AsyncIterator[Api]:
    async with running_api(database_url) as api:
        yield api


async def count(engine: AsyncEngine, sql: str) -> int:
    async with engine.connect() as connection:
        return int(await connection.scalar(text(sql)) or 0)


class TestGoogleSignIn:
    async def test_creates_the_user_and_returns_tokens(self, api: Api, engine: AsyncEngine) -> None:
        response = await api.client.post("/v1/auth/google", json={"idToken": "google-ana"})

        assert response.status_code == 200
        body = response.json()
        assert set(body) == {"accessToken", "accessTokenExpiresAt", "refreshToken", "user"}
        assert body["user"]["email"] == "ana@example.com"
        assert set(body["user"]) == {"id", "email"}
        expires_at = datetime.fromisoformat(body["accessTokenExpiresAt"])
        assert expires_at == T0 + timedelta(minutes=15)
        assert expires_at.tzinfo is not None
        assert await count(engine, "SELECT count(*) FROM users") == 1
        assert await count(engine, "SELECT count(*) FROM refresh_tokens") == 1

    async def test_never_stores_the_refresh_token_in_clear(
        self, api: Api, engine: AsyncEngine
    ) -> None:
        body = await api.sign_in()

        async with engine.connect() as connection:
            stored = await connection.scalar(text("SELECT token_hash FROM refresh_tokens"))
        assert stored != body["refreshToken"]
        assert len(str(stored)) == 64  # SHA-256, hex

    async def test_a_second_sign_in_reuses_the_user(self, api: Api, engine: AsyncEngine) -> None:
        first = await api.sign_in()
        second = await api.sign_in()

        assert second["user"]["id"] == first["user"]["id"]
        assert await count(engine, "SELECT count(*) FROM users") == 1

    async def test_updates_the_email(self, api: Api) -> None:
        first = await api.sign_in()
        api.google.register("google-ana-renamed", sub="sub-ana", email="ana@new.example")

        second = await api.sign_in("google-ana-renamed")

        assert second["user"] == {"id": first["user"]["id"], "email": "ana@new.example"}
        me = await api.me(second["accessToken"])
        assert me.json()["email"] == "ana@new.example"

    async def test_rejects_an_invalid_google_token(self, api: Api) -> None:
        response = await api.client.post("/v1/auth/google", json={"idToken": "forged"})

        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"
        assert response.json()["error"]["code"] == "invalid_google_token"

    async def test_rejects_an_unverified_email(self, api: Api) -> None:
        api.google.unverified.add("google-unverified")

        response = await api.client.post("/v1/auth/google", json={"idToken": "google-unverified"})

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "google_email_not_verified"

    @pytest.mark.parametrize("body", [{}, {"idToken": ""}, {"id_token": "google-ana"}])
    async def test_validates_the_body(self, api: Api, body: dict[str, str]) -> None:
        response = await api.client.post("/v1/auth/google", json=body)

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


class TestRefresh:
    async def test_rotates_the_refresh_token(self, api: Api) -> None:
        signed_in = await api.sign_in()
        api.clock.advance(timedelta(minutes=20))

        response = await api.refresh(signed_in["refreshToken"])

        assert response.status_code == 200
        body = response.json()
        assert set(body) == {"accessToken", "accessTokenExpiresAt", "refreshToken"}
        assert body["refreshToken"] != signed_in["refreshToken"]
        assert datetime.fromisoformat(body["accessTokenExpiresAt"]) == T0 + timedelta(minutes=35)
        assert (await api.me(body["accessToken"])).status_code == 200

    async def test_reuse_revokes_the_family(self, api: Api, engine: AsyncEngine) -> None:
        signed_in = await api.sign_in()
        legit = (await api.refresh(signed_in["refreshToken"])).json()

        reused = await api.refresh(signed_in["refreshToken"])

        assert reused.status_code == 401
        assert reused.json()["error"]["code"] == "refresh_token_reused"
        assert reused.headers["www-authenticate"] == "Bearer"
        revoked = await count(
            engine, "SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NOT NULL"
        )
        assert revoked == 2
        after = await api.refresh(legit["refreshToken"])
        assert after.status_code == 401
        assert after.json()["error"]["code"] == "invalid_refresh_token"

    async def test_rejects_an_expired_refresh_token(self, api: Api) -> None:
        signed_in = await api.sign_in()
        api.clock.advance(timedelta(days=30))

        response = await api.refresh(signed_in["refreshToken"])

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "invalid_refresh_token"

    async def test_rejects_an_unknown_refresh_token(self, api: Api) -> None:
        response = await api.refresh("unknown")

        assert response.status_code == 401


class TestLogout:
    async def test_revokes_the_session(self, api: Api) -> None:
        signed_in = await api.sign_in()

        response = await api.client.post(
            "/v1/auth/logout", json={"refreshToken": signed_in["refreshToken"]}
        )

        assert response.status_code == 204
        assert response.content == b""
        assert (await api.refresh(signed_in["refreshToken"])).status_code == 401

    async def test_unknown_tokens_still_succeed(self, api: Api) -> None:
        response = await api.client.post("/v1/auth/logout", json={"refreshToken": "unknown"})

        assert response.status_code == 204


class TestAccessTokens:
    async def test_expire_after_fifteen_minutes(self, api: Api) -> None:
        signed_in = await api.sign_in()
        api.clock.advance(timedelta(minutes=15))

        response = await api.me(signed_in["accessToken"])

        assert response.status_code == 401
        assert response.headers["www-authenticate"] == 'Bearer error="invalid_token"'
        assert response.json()["error"]["code"] == "invalid_token"

    async def test_a_missing_token_gets_a_bearer_challenge(self, api: Api) -> None:
        response = await api.client.get("/v1/me")

        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"
        assert response.json()["error"]["code"] == "unauthorized"

    async def test_other_schemes_are_rejected(self, api: Api) -> None:
        response = await api.client.get("/v1/me", headers={"Authorization": "Basic YTpi"})

        assert response.status_code == 401

    async def test_timestamps_are_utc(self, api: Api) -> None:
        signed_in = await api.sign_in()

        expires_at = datetime.fromisoformat(signed_in["accessTokenExpiresAt"])
        assert expires_at.utcoffset() == UTC.utcoffset(None)
