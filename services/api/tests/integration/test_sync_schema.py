"""Integrity rules of the sync tables, enforced by PostgreSQL (endpoints arrive in stage 5)."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

ANA, BEN = "00000000-0000-7000-8000-0000000000a1", "00000000-0000-7000-8000-0000000000b1"
ANA_PHONE, BEN_PHONE = (
    "00000000-0000-7000-8000-0000000000a2",
    "00000000-0000-7000-8000-0000000000b2",
)
EVENT = "00000000-0000-7000-8000-0000000000e1"


async def seed_users_and_devices(connection: AsyncConnection) -> None:
    await connection.execute(
        text(
            "INSERT INTO users (id, google_sub, email) "
            "VALUES (:ana, 'sub-ana', 'ana@example.com'), (:ben, 'sub-ben', 'ben@example.com')"
        ),
        {"ana": ANA, "ben": BEN},
    )
    await connection.execute(
        text("INSERT INTO devices (id, user_id) VALUES (:ana_phone, :ana), (:ben_phone, :ben)"),
        {"ana": ANA, "ben": BEN, "ana_phone": ANA_PHONE, "ben_phone": BEN_PHONE},
    )


async def insert_event(
    connection: AsyncConnection, *, event_id: str, user_id: str, device_id: str
) -> None:
    await connection.execute(
        text(
            "INSERT INTO events (id, user_id, device_id, type, payload, local_date, occurred_at) "
            "VALUES (:id, :user_id, :device_id, 'item_reviewed', '{}', '2026-10-30', now())"
        ),
        {"id": event_id, "user_id": user_id, "device_id": device_id},
    )


async def count(connection: AsyncConnection, table: str) -> int:
    return int(await connection.scalar(text(f"SELECT count(*) FROM {table}")) or 0)  # noqa: S608


async def test_an_event_cannot_reference_another_users_device(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        await seed_users_and_devices(connection)

        with pytest.raises(IntegrityError, match="fk_events_device_id_devices"):
            await insert_event(connection, event_id=EVENT, user_id=ANA, device_id=BEN_PHONE)


async def test_event_ids_are_unique_per_user_not_globally(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        await seed_users_and_devices(connection)
        await insert_event(connection, event_id=EVENT, user_id=ANA, device_id=ANA_PHONE)
        await insert_event(connection, event_id=EVENT, user_id=BEN, device_id=BEN_PHONE)

        with pytest.raises(IntegrityError, match="uq_events_user_id_id"):
            await insert_event(connection, event_id=EVENT, user_id=ANA, device_id=ANA_PHONE)


async def test_deleting_a_user_cascades_through_devices_and_events(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        await seed_users_and_devices(connection)
        await insert_event(connection, event_id=EVENT, user_id=ANA, device_id=ANA_PHONE)
        await insert_event(connection, event_id=EVENT, user_id=BEN, device_id=BEN_PHONE)

        await connection.execute(text("DELETE FROM users WHERE id = :ana"), {"ana": ANA})

        assert await count(connection, "devices") == 1
        assert await count(connection, "events") == 1
        remaining = await connection.scalar(text("SELECT user_id::text FROM events"))
        assert remaining == BEN


async def test_deleting_a_device_deletes_its_events(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        await seed_users_and_devices(connection)
        await insert_event(connection, event_id=EVENT, user_id=ANA, device_id=ANA_PHONE)

        await connection.execute(text("DELETE FROM devices WHERE id = :id"), {"id": ANA_PHONE})

        assert await count(connection, "events") == 0
