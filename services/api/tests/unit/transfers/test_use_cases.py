import base64
import hashlib
import logging
import uuid
from datetime import date, timedelta

import pytest

from english_learn_api.shared.logging import JsonFormatter
from english_learn_api.sync.domain.models import NewEvent
from english_learn_api.transfers.application.use_cases import ClaimTransfer, CreateTransfer
from english_learn_api.transfers.domain.errors import TransferCapacityError, TransferNotFoundError
from english_learn_api.transfers.domain.limits import TRANSFER_TTL
from tests.fakes import T0, FakeClock
from tests.transfer_fakes import FakeTransferUnitOfWork, StoredTransfer, TransferStore


def event(grade: int = 3) -> NewEvent:
    return NewEvent(
        id=uuid.uuid7(),
        occurred_at=1_793_361_600_000,
        local_date=date(2026, 10, 30),
        type="item_reviewed",
        payload={"v": 1, "sessionId": "s1", "itemId": "secret-item", "grade": grade},
    )


@pytest.fixture
def store() -> TransferStore:
    return TransferStore()


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


def create(
    store: TransferStore,
    clock: FakeClock,
    purge_batch: int = 100,
    max_live: int = 200,
    max_live_bytes: int = 200 * 1024 * 1024,
) -> CreateTransfer:
    return CreateTransfer(
        unit_of_work=lambda: FakeTransferUnitOfWork(store),
        clock=clock,
        purge_batch=purge_batch,
        max_live=max_live,
        max_live_bytes=max_live_bytes,
    )


def claim(store: TransferStore, clock: FakeClock) -> ClaimTransfer:
    return ClaimTransfer(unit_of_work=lambda: FakeTransferUnitOfWork(store), clock=clock)


async def test_create_returns_a_random_base64url_token_that_expires_in_fifteen_minutes(
    store: TransferStore, clock: FakeClock
) -> None:
    issued = await create(store, clock).execute([event()])
    other = await create(store, clock).execute([event()])

    assert len(base64.urlsafe_b64decode(issued.token + "=")) == 32
    assert issued.token != other.token
    assert issued.expires_at == T0 + timedelta(minutes=15) == T0 + TRANSFER_TTL


async def test_only_the_tokens_sha256_is_stored(store: TransferStore, clock: FakeClock) -> None:
    issued = await create(store, clock).execute([event()])

    [row] = store.rows
    assert row.token_hash == hashlib.sha256(issued.token.encode()).hexdigest()
    assert issued.token not in repr(row)
    assert (row.created_at, row.expires_at, row.claimed_at) == (T0, T0 + TRANSFER_TTL, None)


async def test_a_transfer_returns_its_events_once(store: TransferStore, clock: FakeClock) -> None:
    events = [event(3), event(5)]
    issued = await create(store, clock).execute(events)

    assert await claim(store, clock).execute(issued.token) == events
    with pytest.raises(TransferNotFoundError):
        await claim(store, clock).execute(issued.token)


async def test_a_claimed_transfer_is_deleted(store: TransferStore, clock: FakeClock) -> None:
    issued = await create(store, clock).execute([event()])

    await claim(store, clock).execute(issued.token)

    assert store.rows == []


async def test_an_unknown_token_is_not_found(store: TransferStore, clock: FakeClock) -> None:
    await create(store, clock).execute([event()])

    with pytest.raises(TransferNotFoundError) as raised:
        await claim(store, clock).execute("not-a-token")

    assert raised.value.code == "transfer_not_found"


async def test_a_transfer_expires_after_fifteen_minutes(
    store: TransferStore, clock: FakeClock
) -> None:
    early = await create(store, clock).execute([event()])
    late = await create(store, clock).execute([event()])

    clock.advance(TRANSFER_TTL - timedelta(seconds=1))
    assert len(await claim(store, clock).execute(early.token)) == 1
    clock.advance(timedelta(seconds=1))
    with pytest.raises(TransferNotFoundError):
        await claim(store, clock).execute(late.token)


async def test_expired_and_claimed_transfers_are_purged_in_bounded_batches(
    store: TransferStore, clock: FakeClock
) -> None:
    store.rows = [
        StoredTransfer(f"expired-{n}", (event(),), T0, T0 - timedelta(seconds=1)) for n in range(3)
    ] + [StoredTransfer("claimed", None, T0, T0 + TRANSFER_TTL, claimed_at=T0)]

    await create(store, clock, purge_batch=2).execute([event()])
    assert len(store.rows) == 3  # two purged, one new

    await create(store, clock, purge_batch=2).execute([event()])
    assert [row.claimed_at for row in store.rows] == [None, None]
    assert all(row.expires_at > T0 for row in store.rows)


async def test_logs_carry_counts_but_no_token_or_payload(
    store: TransferStore, clock: FakeClock, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)

    issued = await create(store, clock).execute([event(), event()])
    await claim(store, clock).execute(issued.token)

    lines = [JsonFormatter().format(record) for record in caplog.records]
    assert any('"events": 2' in line for line in lines)
    hashed = hashlib.sha256(issued.token.encode()).hexdigest()
    for secret in (issued.token, hashed, "secret-item"):
        assert not [line for line in lines if secret in line], secret


class TestCapacity:
    async def test_create_is_refused_while_too_many_transfers_are_live(
        self, store: TransferStore, clock: FakeClock
    ) -> None:
        await create(store, clock, max_live=2).execute([event()])
        await create(store, clock, max_live=2).execute([event()])

        with pytest.raises(TransferCapacityError) as raised:
            await create(store, clock, max_live=2).execute([event()])

        assert raised.value.code == "transfer_capacity"
        assert len(store.rows) == 2

    async def test_claimed_and_expired_transfers_free_capacity(
        self, store: TransferStore, clock: FakeClock
    ) -> None:
        first = await create(store, clock, max_live=2).execute([event()])
        await create(store, clock, max_live=2).execute([event()])
        await claim(store, clock).execute(first.token)
        await create(store, clock, max_live=2).execute([event()])

        clock.advance(TRANSFER_TTL)

        await create(store, clock, max_live=2).execute([event()])
        await create(store, clock, max_live=2).execute([event()])
        assert len(store.rows) == 2

    async def test_create_is_refused_while_live_payloads_are_too_big(
        self, store: TransferStore, clock: FakeClock
    ) -> None:
        store.rows = [StoredTransfer("big", (event(),), T0, T0 + TRANSFER_TTL, payload_bytes=900)]

        with pytest.raises(TransferCapacityError):
            await create(store, clock, max_live_bytes=900).execute([event()])
        await create(store, clock, max_live_bytes=901).execute([event()])
