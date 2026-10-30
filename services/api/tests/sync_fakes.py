"""In-memory fakes for the sync ports, with the same copy-on-commit transactions as `fakes.py`."""

from dataclasses import dataclass, field, replace
from datetime import datetime
from types import TracebackType
from typing import Self
from uuid import UUID

from english_learn_api.sync.domain.models import Device, NewEvent, StoredEvent


@dataclass
class SyncStore:
    users: set[UUID] = field(default_factory=set)
    devices: dict[UUID, Device] = field(default_factory=dict)
    events: list[tuple[UUID, StoredEvent]] = field(default_factory=list)  # (user_id, event)
    last_seq: int = 0

    def copy(self) -> SyncStore:
        return SyncStore(set(self.users), dict(self.devices), list(self.events), self.last_seq)

    def replace_with(self, other: SyncStore) -> None:
        self.users = set(other.users)
        self.devices = dict(other.devices)
        self.events = list(other.events)
        self.last_seq = other.last_seq

    def events_of(self, user_id: UUID) -> list[StoredEvent]:
        return [event for owner, event in self.events if owner == user_id]


class InMemoryDevices:
    def __init__(self, store: SyncStore) -> None:
        self._store = store

    async def register(self, device_id: UUID, user_id: UUID, now: datetime) -> bool:
        device = self._store.devices.get(device_id)
        if device is not None and device.user_id != user_id:
            return False
        self._store.devices[device_id] = (
            Device(id=device_id, user_id=user_id, created_at=now, last_seen_at=now)
            if device is None
            else replace(device, last_seen_at=now)
        )
        return True


class InMemoryEventLog:
    def __init__(self, store: SyncStore) -> None:
        self._store = store

    async def lock_for_append(self, user_id: UUID) -> bool:
        return user_id in self._store.users

    async def find(self, user_id: UUID, ids: list[UUID]) -> dict[UUID, StoredEvent]:
        wanted = set(ids)
        return {e.id: e for e in self._store.events_of(user_id) if e.id in wanted}

    async def append(
        self, user_id: UUID, device_id: UUID, events: list[NewEvent], now: datetime
    ) -> list[UUID]:
        stored = {e.id for e in self._store.events_of(user_id)}
        inserted: list[UUID] = []
        for event in events:
            if event.id in stored:
                continue  # ON CONFLICT (user_id, id) DO NOTHING
            self._store.last_seq += 1
            self._store.events.append(
                (
                    user_id,
                    StoredEvent(
                        seq=self._store.last_seq,
                        id=event.id,
                        device_id=device_id,
                        occurred_at=event.occurred_at,
                        local_date=event.local_date,
                        type=event.type,
                        payload=event.payload,
                    ),
                )
            )
            stored.add(event.id)
            inserted.append(event.id)
        return inserted

    async def page_after(self, user_id: UUID, cursor: int, limit: int) -> list[StoredEvent]:
        newer = sorted(
            (e for e in self._store.events_of(user_id) if e.seq > cursor), key=lambda e: e.seq
        )
        return newer[:limit]


class FakeSyncUnitOfWork:
    def __init__(self, store: SyncStore) -> None:
        self._store = store
        self._working = store.copy()
        self.devices = InMemoryDevices(self._working)
        self.events = InMemoryEventLog(self._working)

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
