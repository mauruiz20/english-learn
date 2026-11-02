"""Ports of the transfer use cases. Adapters live in `transfers.infrastructure`; fakes in tests."""

from collections.abc import Callable
from datetime import datetime
from types import TracebackType
from typing import Protocol, Self

from english_learn_api.sync.domain.models import NewEvent
from english_learn_api.transfers.domain.models import LiveUsage, NewTransfer


class TransferStore(Protocol):
    async def add(self, transfer: NewTransfer) -> None: ...

    async def claim(self, token_hash: str, now: datetime) -> list[NewEvent] | None:
        """The transfer's events if it exists, is unclaimed and has not expired at `now`; it is
        marked claimed (its events dropped) in the same statement, so at most one caller ever
        gets them. None otherwise.
        """
        ...

    async def live_usage(self, now: datetime) -> LiveUsage:
        """Unclaimed transfers that have not expired at `now`, and their payload bytes."""
        ...

    async def purge(self, now: datetime, limit: int) -> int:
        """Deletes up to `limit` claimed or expired transfers; returns how many."""
        ...


class TransferUnitOfWork(Protocol):
    """One database transaction. Leaving the block without `commit()` rolls back."""

    @property
    def transfers(self) -> TransferStore: ...

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None: ...

    async def commit(self) -> None: ...


type TransferUnitOfWorkFactory = Callable[[], TransferUnitOfWork]
