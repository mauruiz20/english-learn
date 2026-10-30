"""PostgreSQL adapters for devices and the event log (SQLAlchemy Core, asyncpg)."""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import RowMapping, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from english_learn_api.auth.infrastructure.tables import users
from english_learn_api.sync.domain.models import NewEvent, StoredEvent
from english_learn_api.sync.infrastructure.tables import devices, events

_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
_MS = timedelta(milliseconds=1)


class SqlAlchemyDeviceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def register(self, device_id: UUID, user_id: UUID, now: datetime) -> bool:
        values = insert(devices).values(id=device_id, user_id=user_id, last_seen_at=now)
        statement = values.on_conflict_do_update(
            index_elements=[devices.c.id],
            set_={"last_seen_at": values.excluded.last_seen_at},
            # Another user's device is left untouched and returns no row.
            where=devices.c.user_id == values.excluded.user_id,
        ).returning(devices.c.id)
        return (await self._session.execute(statement)).first() is not None


class SqlAlchemyEventLog:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def lock_for_append(self, user_id: UUID) -> bool:
        # FOR NO KEY UPDATE: one appender per user at a time. It does not conflict with the
        # FOR KEY SHARE that foreign-key checks take (inserting devices and events); an account
        # deletion (FOR UPDATE) and a sync wait for each other in the same user-first order, and
        # a sync that waited for a deletion finds no row. SQLAlchemy spells this lock
        # `key_share=True` without `read=True`.
        statement = select(users.c.id).where(users.c.id == user_id).with_for_update(key_share=True)
        return (await self._session.execute(statement)).first() is not None

    async def find(self, user_id: UUID, ids: list[UUID]) -> dict[UUID, StoredEvent]:
        if not ids:
            return {}
        statement = select(events).where(events.c.user_id == user_id, events.c.id.in_(ids))
        rows = (await self._session.execute(statement)).mappings()
        return {row["id"]: _stored(row) for row in rows}

    async def append(
        self, user_id: UUID, device_id: UUID, new: list[NewEvent], now: datetime
    ) -> list[UUID]:
        if not new:
            return []
        rows: list[dict[str, Any]] = [
            {
                "id": event.id,
                "user_id": user_id,
                "device_id": device_id,
                "type": event.type,
                "payload": event.payload,
                "local_date": event.local_date,
                "occurred_at": _EPOCH + event.occurred_at * _MS,
                "received_at": now,
            }
            for event in new
        ]
        # A multi-row VALUES assigns `seq` in row order, so a batch keeps its upload order.
        statement = (
            insert(events)
            .values(rows)
            .on_conflict_do_nothing(index_elements=[events.c.user_id, events.c.id])
            .returning(events.c.id)
        )
        return list((await self._session.execute(statement)).scalars())

    async def page_after(self, user_id: UUID, cursor: int, limit: int) -> list[StoredEvent]:
        statement = (
            select(events)
            .where(events.c.user_id == user_id, events.c.seq > cursor)
            .order_by(events.c.seq)
            .limit(limit)
        )
        return [_stored(row) for row in (await self._session.execute(statement)).mappings()]


def _stored(row: RowMapping) -> StoredEvent:
    return StoredEvent(
        seq=row["seq"],
        id=row["id"],
        device_id=row["device_id"],
        occurred_at=(row["occurred_at"] - _EPOCH) // _MS,
        local_date=row["local_date"],
        type=row["type"],
        payload=row["payload"],
    )
