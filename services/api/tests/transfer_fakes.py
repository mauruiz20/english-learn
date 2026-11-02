"""In-memory fakes for the transfer ports, with copy-on-commit transactions like `fakes.py`."""

from dataclasses import dataclass, field, replace
from datetime import datetime
from types import TracebackType
from typing import Self

from english_learn_api.sync.domain.models import NewEvent
from english_learn_api.transfers.domain.models import NewTransfer


@dataclass
class StoredTransfer:
    token_hash: str
    events: tuple[NewEvent, ...] | None
    created_at: datetime
    expires_at: datetime
    claimed_at: datetime | None = None


@dataclass
class TransferStore:
    rows: list[StoredTransfer] = field(default_factory=list)

    def copy(self) -> TransferStore:
        return TransferStore([replace(row) for row in self.rows])

    def replace_with(self, other: TransferStore) -> None:
        self.rows = [replace(row) for row in other.rows]


class InMemoryTransfers:
    def __init__(self, store: TransferStore) -> None:
        self._store = store

    async def add(self, transfer: NewTransfer) -> None:
        self._store.rows.append(
            StoredTransfer(
                token_hash=transfer.token_hash,
                events=tuple(transfer.events),
                created_at=transfer.created_at,
                expires_at=transfer.expires_at,
            )
        )

    async def claim(self, token_hash: str, now: datetime) -> list[NewEvent] | None:
        for row in self._store.rows:
            if (
                row.token_hash == token_hash
                and row.claimed_at is None
                and row.expires_at > now
                and row.events is not None
            ):
                events = list(row.events)
                row.claimed_at, row.events = now, None
                return events
        return None

    async def purge(self, now: datetime, limit: int) -> int:
        stale = [r for r in self._store.rows if r.claimed_at is not None or r.expires_at <= now]
        doomed = stale[:limit]
        self._store.rows = [r for r in self._store.rows if r not in doomed]
        return len(doomed)


class FakeTransferUnitOfWork:
    def __init__(self, store: TransferStore) -> None:
        self._store = store
        self._working = store.copy()
        self.transfers = InMemoryTransfers(self._working)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        """Uncommitted changes stay in the discarded working copy."""

    async def commit(self) -> None:
        self._store.replace_with(self._working)
