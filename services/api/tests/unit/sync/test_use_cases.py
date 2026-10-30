import uuid
from datetime import date, timedelta
from typing import Any
from uuid import UUID

import pytest

from english_learn_api.auth.domain.errors import AccountNotFoundError
from english_learn_api.sync.application.use_cases import SyncProgress, Upload
from english_learn_api.sync.domain.errors import DeviceConflictError
from english_learn_api.sync.domain.models import NewEvent
from tests.fakes import T0, FakeClock
from tests.sync_fakes import FakeSyncUnitOfWork, SyncStore

ANA, BEN = uuid.uuid7(), uuid.uuid7()
PHONE, LAPTOP, BEN_PHONE = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()


def event(payload: dict[str, Any] | None = None, *, event_id: UUID | None = None) -> NewEvent:
    return NewEvent(
        id=event_id or uuid.uuid7(),
        occurred_at=1_793_361_600_000,
        local_date=date(2026, 10, 30),
        type="item_reviewed",
        payload={"v": 1, "grade": 3} if payload is None else payload,
    )


@pytest.fixture
def store() -> SyncStore:
    return SyncStore(users={ANA, BEN})


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


def sync(store: SyncStore, clock: FakeClock, page_size: int = 500) -> SyncProgress:
    return SyncProgress(
        unit_of_work=lambda: FakeSyncUnitOfWork(store), clock=clock, page_size=page_size
    )


async def test_first_sync_registers_the_device_and_returns_the_uploaded_events(
    store: SyncStore, clock: FakeClock
) -> None:
    first, second = event(), event()

    result = await sync(store, clock).execute(ANA, Upload(PHONE, None, [first, second]))

    assert [e.id for e in result.events] == [first.id, second.id]
    assert all(e.device_id == PHONE for e in result.events)
    assert result.cursor == result.events[-1].seq
    assert (result.accepted, result.duplicates, result.conflicts) == (2, 0, [])
    assert result.has_more is False
    assert store.devices[PHONE].user_id == ANA
    assert store.devices[PHONE].last_seen_at == T0


async def test_another_device_downloads_what_the_first_uploaded(
    store: SyncStore, clock: FakeClock
) -> None:
    uploaded = event()
    await sync(store, clock).execute(ANA, Upload(PHONE, None, [uploaded]))

    result = await sync(store, clock).execute(ANA, Upload(LAPTOP, None, []))

    assert [(e.id, e.device_id, e.payload) for e in result.events] == [
        (uploaded.id, PHONE, uploaded.payload)
    ]
    assert result.accepted == 0


async def test_only_events_after_the_cursor_are_returned(
    store: SyncStore, clock: FakeClock
) -> None:
    first = await sync(store, clock).execute(ANA, Upload(PHONE, None, [event()]))
    later = event()
    await sync(store, clock).execute(ANA, Upload(LAPTOP, None, [later]))

    result = await sync(store, clock).execute(ANA, Upload(PHONE, first.cursor, []))

    assert [e.id for e in result.events] == [later.id]


async def test_an_empty_page_keeps_the_cursor(store: SyncStore, clock: FakeClock) -> None:
    first = await sync(store, clock).execute(ANA, Upload(PHONE, None, [event()]))

    result = await sync(store, clock).execute(ANA, Upload(PHONE, first.cursor, []))
    empty = await sync(store, clock).execute(BEN, Upload(BEN_PHONE, None, []))

    assert (result.events, result.cursor, result.has_more) == ([], first.cursor, False)
    assert (empty.events, empty.cursor) == ([], 0)


async def test_pages_are_bounded_and_report_more(store: SyncStore, clock: FakeClock) -> None:
    events = [event() for _ in range(5)]
    first = await sync(store, clock, page_size=2).execute(ANA, Upload(PHONE, None, events))

    pages = [first]
    while pages[-1].has_more:
        pages.append(
            await sync(store, clock, page_size=2).execute(ANA, Upload(PHONE, pages[-1].cursor, []))
        )

    assert [len(p.events) for p in pages] == [2, 2, 1]
    assert [e.id for p in pages for e in p.events] == [e.id for e in events]
    assert [p.has_more for p in pages] == [True, True, False]


async def test_resending_the_same_events_is_idempotent(store: SyncStore, clock: FakeClock) -> None:
    events = [event(), event()]
    await sync(store, clock).execute(ANA, Upload(PHONE, None, events))

    result = await sync(store, clock).execute(ANA, Upload(PHONE, None, events))

    assert (result.accepted, result.duplicates, result.conflicts) == (0, 2, [])
    assert len(store.events_of(ANA)) == 2


async def test_different_content_under_a_known_id_keeps_the_first_and_is_reported(
    store: SyncStore, clock: FakeClock
) -> None:
    original = event({"v": 1, "grade": 3})
    await sync(store, clock).execute(ANA, Upload(PHONE, None, [original]))
    tampered, fresh = event({"v": 1, "grade": 0}, event_id=original.id), event()

    result = await sync(store, clock).execute(ANA, Upload(LAPTOP, None, [tampered, fresh]))

    assert (result.accepted, result.duplicates, result.conflicts) == (1, 0, [original.id])
    kept = next(e for e in store.events_of(ANA) if e.id == original.id)
    assert (kept.payload, kept.device_id) == (original.payload, PHONE)


async def test_repeats_inside_one_batch_count_as_duplicates_or_conflicts(
    store: SyncStore, clock: FakeClock
) -> None:
    original = event({"v": 1, "grade": 3})
    copy = event({"v": 1, "grade": 3}, event_id=original.id)
    tampered = event({"v": 1, "grade": 1}, event_id=original.id)

    result = await sync(store, clock).execute(ANA, Upload(PHONE, None, [original, copy, tampered]))

    assert (result.accepted, result.duplicates, result.conflicts) == (1, 1, [original.id])
    assert [e.payload for e in store.events_of(ANA)] == [original.payload]


async def test_a_conflicting_id_is_reported_once(store: SyncStore, clock: FakeClock) -> None:
    original = event({"v": 1})
    await sync(store, clock).execute(ANA, Upload(PHONE, None, [original]))
    one, two = (event({"v": n}, event_id=original.id) for n in (2, 3))

    result = await sync(store, clock).execute(ANA, Upload(PHONE, None, [one, two]))

    assert result.conflicts == [original.id]


async def test_the_same_content_from_another_device_is_a_duplicate(
    store: SyncStore, clock: FakeClock
) -> None:
    original = event()
    await sync(store, clock).execute(ANA, Upload(PHONE, None, [original]))

    result = await sync(store, clock).execute(ANA, Upload(LAPTOP, None, [original]))

    assert (result.accepted, result.duplicates) == (0, 1)


async def test_a_device_of_another_user_is_refused_and_nothing_is_stored(
    store: SyncStore, clock: FakeClock
) -> None:
    await sync(store, clock).execute(BEN, Upload(BEN_PHONE, None, []))

    with pytest.raises(DeviceConflictError):
        await sync(store, clock).execute(ANA, Upload(BEN_PHONE, None, [event()]))

    assert store.events_of(ANA) == []
    assert store.devices[BEN_PHONE].user_id == BEN


async def test_event_ids_are_scoped_per_user(store: SyncStore, clock: FakeClock) -> None:
    shared = event()
    await sync(store, clock).execute(BEN, Upload(BEN_PHONE, None, [shared]))

    result = await sync(store, clock).execute(ANA, Upload(PHONE, None, [shared]))

    assert (result.accepted, result.duplicates) == (1, 0)
    assert [e.device_id for e in result.events] == [PHONE]


async def test_users_never_see_each_others_events(store: SyncStore, clock: FakeClock) -> None:
    await sync(store, clock).execute(BEN, Upload(BEN_PHONE, None, [event()]))

    result = await sync(store, clock).execute(ANA, Upload(PHONE, None, []))

    assert result.events == []


async def test_every_sync_updates_last_seen(store: SyncStore, clock: FakeClock) -> None:
    await sync(store, clock).execute(ANA, Upload(PHONE, None, []))
    clock.advance(timedelta(hours=1))

    await sync(store, clock).execute(ANA, Upload(PHONE, None, []))

    assert store.devices[PHONE].created_at == T0
    assert store.devices[PHONE].last_seen_at == T0 + timedelta(hours=1)


async def test_a_deleted_user_cannot_sync(store: SyncStore, clock: FakeClock) -> None:
    store.users.discard(ANA)

    with pytest.raises(AccountNotFoundError):
        await sync(store, clock).execute(ANA, Upload(PHONE, None, [event()]))

    assert store.devices == {}
    assert store.events == []
