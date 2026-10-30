from collections.abc import AsyncIterator
from datetime import timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.integration.api_harness import Api, bearer, running_api


@pytest.fixture
async def api(database_url: str) -> AsyncIterator[Api]:
    async with running_api(database_url) as api:
        yield api


async def test_me_returns_the_signed_in_user(api: Api) -> None:
    signed_in = await api.sign_in()

    response = await api.me(signed_in["accessToken"])

    assert response.status_code == 200
    assert response.json() == signed_in["user"]


async def test_delete_account_removes_the_user_and_everything_they_own(
    api: Api, engine: AsyncEngine
) -> None:
    signed_in = await api.sign_in()
    user_id = signed_in["user"]["id"]
    await seed_device_and_event(engine, user_id)

    response = await api.client.delete("/v1/account", headers=bearer(signed_in["accessToken"]))

    assert response.status_code == 204
    async with engine.connect() as connection:
        for table in ("users", "devices", "events", "refresh_tokens"):
            remaining = await connection.scalar(text(f"SELECT count(*) FROM {table}"))  # noqa: S608
            assert remaining == 0, table


async def test_a_deleted_account_cannot_be_used(api: Api) -> None:
    signed_in = await api.sign_in()
    await api.client.delete("/v1/account", headers=bearer(signed_in["accessToken"]))

    me = await api.me(signed_in["accessToken"])
    again = await api.client.delete("/v1/account", headers=bearer(signed_in["accessToken"]))
    refresh = await api.refresh(signed_in["refreshToken"])

    assert me.status_code == 401
    assert me.json()["error"]["code"] == "account_not_found"
    assert again.status_code == 401
    assert again.json()["error"]["code"] == "account_not_found"
    assert refresh.status_code == 401


async def test_delete_requires_a_sign_in_within_five_minutes(api: Api) -> None:
    signed_in = await api.sign_in()
    api.clock.advance(timedelta(minutes=10))
    refreshed = (await api.refresh(signed_in["refreshToken"])).json()  # new iat, old sign-in

    response = await api.client.delete("/v1/account", headers=bearer(refreshed["accessToken"]))

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "reauthentication_required"
    assert (await api.me(refreshed["accessToken"])).status_code == 200

    fresh = await api.sign_in()
    deleted = await api.client.delete("/v1/account", headers=bearer(fresh["accessToken"]))
    assert deleted.status_code == 204


async def test_signing_in_after_deleting_creates_a_new_account(api: Api) -> None:
    first = await api.sign_in()
    await api.client.delete("/v1/account", headers=bearer(first["accessToken"]))

    second = await api.sign_in()

    assert second["user"]["id"] != first["user"]["id"]


async def test_delete_requires_a_token(api: Api) -> None:
    response = await api.client.delete("/v1/account")

    assert response.status_code == 401


async def seed_device_and_event(engine: AsyncEngine, user_id: str) -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO devices (id, user_id) "
                "VALUES ('00000000-0000-7000-8000-0000000000d1', :user_id)"
            ),
            {"user_id": user_id},
        )
        await connection.execute(
            text(
                "INSERT INTO events (id, user_id, device_id, type, payload, local_date, "
                "occurred_at) VALUES ('00000000-0000-7000-8000-0000000000e1', :user_id, "
                "'00000000-0000-7000-8000-0000000000d1', 'session_completed', '{\"v\": 1}', "
                "'2026-10-30', now())"
            ),
            {"user_id": user_id},
        )
