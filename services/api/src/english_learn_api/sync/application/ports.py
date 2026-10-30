"""Ports of the sync use case. Adapters live in `sync.infrastructure`; fakes in tests."""

from collections.abc import Callable
from datetime import datetime
from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from english_learn_api.sync.domain.models import NewEvent, StoredEvent


class DeviceRepository(Protocol):
    async def register(self, device_id: UUID, user_id: UUID, now: datetime) -> bool:
        """Create the device for the user, or touch its `last_seen_at`.

        Returns False, changing nothing, when the id belongs to another user.
        """
        ...


class EventLog(Protocol):
    async def lock_for_append(self, user_id: UUID) -> bool:
        """Serialize this user's appends until the transaction ends; False if the user is gone.

        Sequence numbers are taken when rows are inserted but become visible when they commit.
        With one appender per user at a time, a user's events commit in `seq` order, so a reader
        that saw `seq` N can never later find a smaller one committed behind its cursor.
        """
        ...

    async def find(self, user_id: UUID, ids: list[UUID]) -> dict[UUID, StoredEvent]:
        """The user's stored events with these ids."""
        ...

    async def append(
        self, user_id: UUID, device_id: UUID, events: list[NewEvent], now: datetime
    ) -> list[UUID]:
        """Insert in order, skipping ids the user already has. Returns the inserted ids."""
        ...

    async def page_after(self, user_id: UUID, cursor: int, limit: int) -> list[StoredEvent]:
        """Up to `limit` of the user's events with `seq > cursor`, in `seq` order."""
        ...


class SyncUnitOfWork(Protocol):
    """One database transaction. Leaving the block without `commit()` rolls back."""

    @property
    def devices(self) -> DeviceRepository: ...

    @property
    def events(self) -> EventLog: ...

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None: ...

    async def commit(self) -> None: ...


type SyncUnitOfWorkFactory = Callable[[], SyncUnitOfWork]
