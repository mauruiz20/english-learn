"""Concurrent syncs against a real PostgreSQL (READ COMMITTED), with forced interleavings.

The hazard: `seq` comes from a sequence when a row is inserted, but the row becomes visible when
its transaction commits. If two syncs of one user appended concurrently, the one holding the
lower `seq` could commit last; a reader in between would advance its cursor past the higher
`seq` and never see the lower one. Appends of one user are therefore serialized (a lock on the
user row), so a user's events always commit in `seq` order.
"""

import asyncio
import uuid
from asyncio import FIRST_COMPLETED
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date
from typing import Any, Self

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from english_learn_api.account.application import DeleteAccount
from english_learn_api.auth.domain.errors import AccountNotFoundError
from english_learn_api.auth.infrastructure.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from english_learn_api.shared.database import create_session_factory
from english_learn_api.sync.application.ports import SyncUnitOfWorkFactory
from english_learn_api.sync.application.use_cases import SyncProgress, Upload
from english_learn_api.sync.domain.models import NewEvent
from english_learn_api.sync.infrastructure.sqlalchemy_repositories import SqlAlchemyEventLog
from english_learn_api.sync.infrastructure.sqlalchemy_unit_of_work import (
    SqlAlchemySyncUnitOfWork,
)
from tests.fakes import FakeClock
from tests.integration.concurrency import (
    Gate,
    PauseBeforeCommit,
    wait_until_a_transaction_waits_for_a_lock,
)

ANA = uuid.uuid7()
PHONE, LAPTOP, TABLET = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()


class PausingSync(SqlAlchemySyncUnitOfWork):
    def __init__(self, session_factory: async_sessionmaker[AsyncSession], gate: Gate) -> None:
        super().__init__(session_factory)
        self._gate = gate

    async def commit(self) -> None:
        await self._gate.pass_through()
        await super().commit()


async def paused(gate: Gate, task: asyncio.Task[Any]) -> None:
    """Wait for the task to reach its pause point, failing fast if it dies before it."""
    reached = asyncio.create_task(gate.reached.wait())
    done, _ = await asyncio.wait({reached, task}, timeout=10, return_when=FIRST_COMPLETED)
    reached.cancel()
    if task in done:
        task.result()  # re-raises its error
    assert gate.reached.is_set(), "the paused transaction never reached its pause point"


@asynccontextmanager
async def opened_at_exit(gate: Gate) -> AsyncIterator[None]:
    """Release the paused transaction even when an assertion fails, so it cannot hold its locks
    (and block the next test's TRUNCATE) forever."""
    try:
        yield
    finally:
        gate.opened.set()


class Harness:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine
        self.session_factory = create_session_factory(engine)
        self.clock = FakeClock()
        self.sync = self.sync_with(lambda: SqlAlchemySyncUnitOfWork(self.session_factory))

    def sync_with(self, unit_of_work: SyncUnitOfWorkFactory) -> SyncProgress:
        return SyncProgress(unit_of_work=unit_of_work, clock=self.clock)

    def paused(self, gate: Gate) -> SyncProgress:
        return self.sync_with(lambda: PausingSync(self.session_factory, gate))

    async def seqs(self) -> dict[uuid.UUID, int]:
        async with self.engine.connect() as connection:
            rows = await connection.execute(text("SELECT id, seq FROM events"))
        return {row.id: row.seq for row in rows}


@pytest.fixture
async def harness(engine: AsyncEngine) -> Harness:
    async with engine.begin() as connection:
        await connection.execute(
            text("INSERT INTO users (id, google_sub, email) VALUES (:id, 'sub-ana', 'a@x.io')"),
            {"id": ANA},
        )
    return Harness(engine)


def event(n: int = 0) -> NewEvent:
    return NewEvent(
        id=uuid.uuid7(),
        occurred_at=1_793_361_600_000 + n,
        local_date=date(2026, 10, 30),
        type="item_reviewed",
        payload={"v": 1, "n": n},
    )


async def test_a_second_append_waits_until_the_first_commits(harness: Harness) -> None:
    """The phone's event has its `seq` but is not committed; the laptop's sync must not commit a
    higher `seq` before it, or a reader could step over the phone's event for good."""
    from_phone, from_laptop = event(1), event(2)
    gate = Gate()
    phone = asyncio.create_task(
        harness.paused(gate).execute(ANA, Upload(PHONE, None, [from_phone]))
    )
    await paused(gate, phone)  # inserted, seq taken, user lock held

    laptop = asyncio.create_task(harness.sync.execute(ANA, Upload(LAPTOP, None, [from_laptop])))
    async with opened_at_exit(gate):
        await wait_until_a_transaction_waits_for_a_lock(harness.engine)
        reader = await asyncio.wait_for(
            harness.sync_with(lambda: _ReadOnly(harness.session_factory)).execute(
                ANA, Upload(TABLET, None, [])
            ),
            timeout=5,
        )
    phone_result, laptop_result = await asyncio.gather(phone, laptop)

    seqs = await harness.seqs()
    assert seqs[from_phone.id] < seqs[from_laptop.id]
    assert reader.events == []  # nothing committed yet, so nothing to step over
    assert [e.id for e in phone_result.events] == [from_phone.id]
    assert [e.id for e in laptop_result.events] == [from_phone.id, from_laptop.id]


async def test_concurrent_syncs_never_let_a_reader_skip_an_event(harness: Harness) -> None:
    """Two devices append many small batches at once while a third follows its cursor."""
    batches = {device: [[event(i * 10 + j) for j in range(3)] for i in range(12)]
               for device in (PHONE, LAPTOP)}  # fmt: skip
    writing = True
    seen: list[uuid.UUID] = []

    async def write(device: uuid.UUID) -> None:
        for batch in batches[device]:
            await harness.sync.execute(ANA, Upload(device, None, batch))

    async def follow() -> None:
        cursor = 0
        while True:
            still_writing = writing
            result = await harness.sync.execute(ANA, Upload(TABLET, cursor, []))
            seen.extend(e.id for e in result.events)
            assert all(e.seq > cursor for e in result.events)
            cursor = result.cursor
            if not still_writing and not result.has_more:
                return
            await asyncio.sleep(0)

    reader = asyncio.create_task(follow())
    await asyncio.gather(write(PHONE), write(LAPTOP))
    writing = False
    await reader

    uploaded = [e.id for device in batches.values() for batch in device for e in batch]
    seqs = await harness.seqs()
    assert sorted(seen) == sorted(uploaded)  # every event, each exactly once
    assert seen == sorted(seen, key=seqs.__getitem__)


async def test_an_account_deletion_waits_for_a_sync_and_removes_what_it_stored(
    harness: Harness,
) -> None:
    gate = Gate()
    syncing = asyncio.create_task(harness.paused(gate).execute(ANA, Upload(PHONE, None, [event()])))
    await paused(gate, syncing)

    delete = DeleteAccount(
        unit_of_work=lambda: SqlAlchemyUnitOfWork(harness.session_factory), clock=harness.clock
    )
    deleting = asyncio.create_task(delete.execute(ANA, authenticated_at=harness.clock.now()))
    async with opened_at_exit(gate):
        await wait_until_a_transaction_waits_for_a_lock(harness.engine)
    await asyncio.gather(syncing, deleting)

    assert await harness.seqs() == {}


async def test_a_sync_racing_an_account_deletion_ends_in_account_not_found(
    harness: Harness,
) -> None:
    gate = Gate()
    delete = DeleteAccount(
        unit_of_work=lambda: PauseBeforeCommit(harness.session_factory, gate),
        clock=harness.clock,
    )
    deleting = asyncio.create_task(delete.execute(ANA, authenticated_at=harness.clock.now()))
    await paused(gate, deleting)  # the user row is deleted, not committed

    syncing = asyncio.create_task(harness.sync.execute(ANA, Upload(PHONE, None, [event()])))
    async with opened_at_exit(gate):
        await wait_until_a_transaction_waits_for_a_lock(harness.engine)
    await deleting

    with pytest.raises(AccountNotFoundError):
        await syncing
    assert await harness.seqs() == {}


class _UnlockedEventLog(SqlAlchemyEventLog):
    async def lock_for_append(self, user_id: uuid.UUID) -> bool:
        return True


class _ReadOnly(SqlAlchemySyncUnitOfWork):
    """A reader that does not queue behind the writers' lock: it sees only committed rows."""

    async def __aenter__(self) -> Self:
        await super().__aenter__()
        self.events = _UnlockedEventLog(self._session)
        return self
