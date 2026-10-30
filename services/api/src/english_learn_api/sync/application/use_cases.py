"""Progress sync: a device uploads the events it has, and downloads the user's events after its
cursor. Both happen in one transaction; the server never interprets payloads.
"""

import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from uuid import UUID

from english_learn_api.auth.domain.errors import AccountNotFoundError
from english_learn_api.shared.clock import Clock
from english_learn_api.sync.application.ports import SyncUnitOfWorkFactory
from english_learn_api.sync.domain.errors import DeviceConflictError
from english_learn_api.sync.domain.limits import PAGE_SIZE
from english_learn_api.sync.domain.models import NewEvent, StoredEvent

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class Upload:
    device_id: UUID
    cursor: int | None
    """`seq` of the last event the device has; None on its first sync."""
    events: Sequence[NewEvent]


@dataclass(frozen=True, slots=True)
class SyncResult:
    events: list[StoredEvent]
    """The user's events after the cursor (their own uploads included), in `seq` order."""
    cursor: int
    """Send it back next time: the `seq` of the last returned event, or the request's cursor."""
    has_more: bool
    accepted: int
    duplicates: int
    """Uploaded ids already stored (or repeated in the batch) with the same content."""
    conflicts: list[UUID] = field(default_factory=list)
    """Uploaded ids already stored with different content. The first version is kept."""


@dataclass(slots=True)
class _Triage:
    new: dict[UUID, NewEvent] = field(default_factory=dict)
    duplicates: int = 0
    conflicts: dict[UUID, None] = field(default_factory=dict)  # ordered set

    def classify(self, event: NewEvent, first: NewEvent | StoredEvent) -> None:
        if event.same_content(first):
            self.duplicates += 1
        else:
            self.conflicts[event.id] = None


class SyncProgress:
    def __init__(
        self, *, unit_of_work: SyncUnitOfWorkFactory, clock: Clock, page_size: int = PAGE_SIZE
    ) -> None:
        self._unit_of_work = unit_of_work
        self._clock = clock
        self._page_size = page_size

    async def execute(self, user_id: UUID, upload: Upload) -> SyncResult:
        now = self._clock.now()
        cursor = upload.cursor or 0
        async with self._unit_of_work() as uow:
            # Lock order: user, then device and event rows (as an account deletion cascades).
            if not await uow.events.lock_for_append(user_id):
                msg = "Account no longer exists"
                raise AccountNotFoundError(msg)
            if not await uow.devices.register(upload.device_id, user_id, now):
                msg = "This device id belongs to another account; generate a new one"
                raise DeviceConflictError(msg)

            stored = await uow.events.find(user_id, list({e.id: None for e in upload.events}))
            triage = _Triage()
            for event in upload.events:
                if (first := stored.get(event.id) or triage.new.get(event.id)) is not None:
                    triage.classify(event, first)
                else:
                    triage.new[event.id] = event
            accepted = await uow.events.append(
                user_id, upload.device_id, list(triage.new.values()), now
            )

            page = await uow.events.page_after(user_id, cursor, self._page_size + 1)
            await uow.commit()

        returned = page[: self._page_size]
        logger.info(
            "progress synced",
            extra={
                "user_id": str(user_id),
                "accepted": len(accepted),
                "duplicates": triage.duplicates,
                "conflicts": len(triage.conflicts),
                "returned": len(returned),
            },
        )
        return SyncResult(
            events=returned,
            cursor=returned[-1].seq if returned else cursor,
            has_more=len(page) > self._page_size,
            accepted=len(accepted),
            duplicates=triage.duplicates,
            conflicts=list(triage.conflicts),
        )
