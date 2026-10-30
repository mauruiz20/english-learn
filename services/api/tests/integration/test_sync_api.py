"""`POST /v1/sync` through the real app and PostgreSQL."""

import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.integration.api_harness import Api, bearer, running_api

PHONE, LAPTOP = str(uuid.uuid4()), str(uuid.uuid4())


@pytest.fixture
async def api(database_url: str) -> AsyncIterator[Api]:
    async with running_api(database_url) as api:
        api.google.register("google-ben", sub="sub-ben", email="ben@example.com")
        yield api


def event(**overrides: Any) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid7()),
        "occurredAt": 1_793_361_600_000,
        "localDate": "2026-10-30",
        "type": "item_reviewed",
        "payload": {"v": 1, "sessionId": "s1", "itemId": "i1", "grade": 3},
        **overrides,
    }


async def sync(
    api: Api,
    access_token: str,
    device_id: str,
    events: list[dict[str, Any]] | None = None,
    cursor: int | None = None,
) -> httpx.Response:
    return await api.client.post(
        "/v1/sync",
        json={"deviceId": device_id, "cursor": cursor, "events": events or []},
        headers=bearer(access_token),
    )


async def ok(response: httpx.Response) -> dict[str, Any]:
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def test_first_sync_uploads_and_returns_a_cursor(api: Api) -> None:
    ana = (await api.sign_in())["accessToken"]
    uploaded = [event(), event(type="session_completed", payload={"v": 1, "answerXp": 10})]

    body = await ok(await sync(api, ana, PHONE, uploaded))

    assert body["accepted"] == 2
    assert (body["duplicates"], body["conflicts"], body["hasMore"]) == (0, [], False)
    assert [e["id"] for e in body["events"]] == [e["id"] for e in uploaded]
    assert body["events"][1] == {**uploaded[1], "deviceId": PHONE}
    assert body["cursor"] > 0


async def test_a_second_device_downloads_the_first_devices_events(api: Api) -> None:
    ana = (await api.sign_in())["accessToken"]
    uploaded = event(payload={"v": 1, "nested": {"list": [1, 2.5, None, True], "s": "ñ"}})
    first = await ok(await sync(api, ana, PHONE, [uploaded]))

    laptop = await ok(await sync(api, ana, LAPTOP))
    again = await ok(await sync(api, ana, LAPTOP, cursor=laptop["cursor"]))

    assert laptop["events"] == [{**uploaded, "deviceId": PHONE}]
    assert laptop["cursor"] == first["cursor"]
    assert (again["events"], again["cursor"]) == ([], first["cursor"])


async def test_resending_is_idempotent(api: Api, engine: AsyncEngine) -> None:
    ana = (await api.sign_in())["accessToken"]
    uploaded = [event(), event()]
    first = await ok(await sync(api, ana, PHONE, uploaded))

    resent = await ok(await sync(api, ana, PHONE, uploaded, cursor=first["cursor"]))

    assert (resent["accepted"], resent["duplicates"], resent["conflicts"]) == (0, 2, [])
    assert resent["events"] == []
    assert await count(engine, "events") == 2


async def test_different_content_under_a_stored_id_is_reported_not_stored(api: Api) -> None:
    ana = (await api.sign_in())["accessToken"]
    original = event()
    await ok(await sync(api, ana, PHONE, [original]))
    tampered = {**original, "payload": {"v": 1, "grade": 0}}
    fresh = event()

    body = await ok(await sync(api, ana, LAPTOP, [tampered, fresh]))

    assert (body["accepted"], body["duplicates"], body["conflicts"]) == (1, 0, [original["id"]])
    assert [e["payload"] for e in body["events"]] == [original["payload"], fresh["payload"]]


async def test_pages_follow_seq_and_report_has_more(api: Api) -> None:
    ana = (await api.sign_in())["accessToken"]
    uploaded = [event() for _ in range(501)]
    await ok(await sync(api, ana, PHONE, uploaded[:500]))
    await ok(await sync(api, ana, PHONE, uploaded[500:]))

    first = await ok(await sync(api, ana, LAPTOP))
    second = await ok(await sync(api, ana, LAPTOP, cursor=first["cursor"]))

    assert (len(first["events"]), first["hasMore"]) == (500, True)
    assert (len(second["events"]), second["hasMore"]) == (1, False)
    downloaded = [e["id"] for e in first["events"] + second["events"]]
    assert downloaded == [e["id"] for e in uploaded]


async def test_users_never_see_or_write_each_others_events(api: Api) -> None:
    ana = (await api.sign_in())["accessToken"]
    ben = (await api.sign_in("google-ben"))["accessToken"]
    shared_id = event()
    await ok(await sync(api, ana, PHONE, [shared_id, event()]))

    bens = await ok(await sync(api, ben, LAPTOP, [shared_id]))  # same event id, other user
    ana_with_bens_device = await sync(api, ana, LAPTOP, [event()])
    ana_again = await ok(await sync(api, ana, PHONE))

    assert [(e["id"], e["deviceId"]) for e in bens["events"]] == [(shared_id["id"], LAPTOP)]
    assert bens["accepted"] == 1
    assert ana_with_bens_device.status_code == 409
    assert ana_with_bens_device.json()["error"]["code"] == "device_conflict"
    assert len(ana_again["events"]) == 2
    assert {e["deviceId"] for e in ana_again["events"]} == {PHONE}


async def test_a_device_conflict_stores_nothing(api: Api, engine: AsyncEngine) -> None:
    ana = (await api.sign_in())["accessToken"]
    ben = (await api.sign_in("google-ben"))["accessToken"]
    await ok(await sync(api, ben, LAPTOP))

    response = await sync(api, ana, LAPTOP, [event()])

    assert response.status_code == 409
    assert await count(engine, "events") == 0
    assert await count(engine, "devices") == 1


async def test_devices_are_registered_and_seen(api: Api, engine: AsyncEngine) -> None:
    signed_in = await api.sign_in()

    await ok(await sync(api, signed_in["accessToken"], PHONE))

    async with engine.connect() as connection:
        row = (
            await connection.execute(
                text("SELECT user_id::text, last_seen_at FROM devices WHERE id = :id"),
                {"id": PHONE},
            )
        ).one()
    assert row.user_id == signed_in["user"]["id"]
    assert row.last_seen_at == api.clock.now()


async def test_sync_needs_a_valid_token(api: Api) -> None:
    missing = await api.client.post("/v1/sync", json={"deviceId": PHONE, "cursor": None})
    forged = await sync(api, "not-a-token", PHONE)

    assert missing.status_code == 401
    assert forged.status_code == 401
    assert forged.json()["error"]["code"] == "invalid_token"


async def test_invalid_envelopes_are_refused_with_422(api: Api, engine: AsyncEngine) -> None:
    ana = (await api.sign_in())["accessToken"]

    response = await sync(api, ana, PHONE, [event(), event(id=str(uuid.uuid4()))])

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert await count(engine, "events") == 0


async def test_payload_nul_characters_are_a_422_not_a_500(api: Api) -> None:
    ana = (await api.sign_in())["accessToken"]

    response = await sync(api, ana, PHONE, [event(payload={"text": "a\u0000b"})])

    assert response.status_code == 422


async def test_deleting_the_account_removes_its_events_and_blocks_sync(
    api: Api, engine: AsyncEngine
) -> None:
    ana = (await api.sign_in())["accessToken"]
    await ok(await sync(api, ana, PHONE, [event(), event()]))

    deleted = await api.client.delete("/v1/account", headers=bearer(ana))
    after = await sync(api, ana, PHONE, [event()])
    fresh = (await api.sign_in())["accessToken"]
    new_account = await ok(await sync(api, fresh, PHONE))

    assert deleted.status_code == 204
    assert after.status_code == 401
    assert after.json()["error"]["code"] == "account_not_found"
    assert new_account["events"] == []
    assert await count(engine, "events") == 0


async def count(engine: AsyncEngine, table: str) -> int:
    async with engine.connect() as connection:
        return int(await connection.scalar(text(f"SELECT count(*) FROM {table}")) or 0)  # noqa: S608
