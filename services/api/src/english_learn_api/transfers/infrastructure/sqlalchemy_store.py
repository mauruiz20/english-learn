"""PostgreSQL adapter for transfers (SQLAlchemy Core, asyncpg)."""

import json
import zlib
from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from english_learn_api.sync.domain.models import NewEvent
from english_learn_api.transfers.domain.models import NewTransfer
from english_learn_api.transfers.infrastructure.tables import transfers


def encode_events(events: list[NewEvent]) -> bytes:
    wire = [
        {
            "id": str(event.id),
            "occurredAt": event.occurred_at,
            "localDate": event.local_date.isoformat(),
            "type": event.type,
            "payload": event.payload,
        }
        for event in events
    ]
    return zlib.compress(json.dumps(wire, separators=(",", ":"), ensure_ascii=False).encode())


def decode_events(payload: bytes) -> list[NewEvent]:
    wire: list[dict[str, Any]] = json.loads(zlib.decompress(payload))
    return [
        NewEvent(
            id=UUID(item["id"]),
            occurred_at=item["occurredAt"],
            local_date=date.fromisoformat(item["localDate"]),
            type=item["type"],
            payload=item["payload"],
        )
        for item in wire
    ]


class SqlAlchemyTransferStore:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, transfer: NewTransfer) -> None:
        await self._session.execute(
            transfers.insert().values(
                token_hash=transfer.token_hash,
                payload=encode_events(list(transfer.events)),
                created_at=transfer.created_at,
                expires_at=transfer.expires_at,
            )
        )

    async def claim(self, token_hash: str, now: datetime) -> list[NewEvent] | None:
        # One statement: the row lock makes a concurrent claim wait, then re-check the WHERE
        # (now false: claimed, or gone) and match nothing. Exactly one caller gets the events.
        claimable = (
            select(transfers.c.id, transfers.c.payload)
            .where(
                transfers.c.token_hash == token_hash,
                transfers.c.claimed_at.is_(None),
                transfers.c.expires_at > now,
            )
            .with_for_update()
            .cte("claimable")
        )
        statement = (
            update(transfers)
            .where(transfers.c.id == claimable.c.id)
            .values(claimed_at=now, payload=None)
            .returning(claimable.c.payload)
        )
        payload = (await self._session.execute(statement)).scalar_one_or_none()
        return None if payload is None else decode_events(payload)

    async def purge(self, now: datetime, limit: int) -> int:
        stale = (
            select(transfers.c.id)
            .where((transfers.c.claimed_at.is_not(None)) | (transfers.c.expires_at <= now))
            .limit(limit)
            # Rows another transaction is claiming are left for a later purge.
            .with_for_update(skip_locked=True)
        )
        result = await self._session.execute(
            delete(transfers).where(transfers.c.id.in_(stale)).returning(transfers.c.id)
        )
        return len(result.all())
