"""Progress events as the server sees them: an envelope plus an opaque JSON payload.

The fold that gives events meaning lives in the client (`packages/domain`); the server stores,
deduplicates by id and pages them, nothing else.
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from uuid import UUID


@dataclass(frozen=True, slots=True)
class NewEvent:
    """An event uploaded by a device. `occurred_at` is epoch milliseconds, as on the wire."""

    id: UUID
    occurred_at: int
    local_date: date
    type: str
    payload: dict[str, Any]

    def same_content(self, other: NewEvent | StoredEvent) -> bool:
        """Identical apart from where it came from (a resend, possibly from another device)."""
        return (self.occurred_at, self.local_date, self.type, self.payload) == (
            other.occurred_at,
            other.local_date,
            other.type,
            other.payload,
        )


@dataclass(frozen=True, slots=True)
class StoredEvent:
    """An event in a user's log. `seq` orders the log; `device_id` is the uploading device."""

    seq: int
    id: UUID
    device_id: UUID
    occurred_at: int
    local_date: date
    type: str
    payload: dict[str, Any]


@dataclass(frozen=True, slots=True)
class Device:
    id: UUID
    user_id: UUID
    created_at: datetime
    last_seen_at: datetime | None
