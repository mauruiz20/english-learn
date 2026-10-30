"""`POST /v1/sync` bodies. The envelope is validated strictly; payloads only for shape and size."""

import json
from datetime import date
from typing import Annotated, Any
from uuid import UUID

from pydantic import AfterValidator, Field, StrictInt, StringConstraints

from english_learn_api.auth.api.schemas import CamelRequest, CamelResponse
from english_learn_api.sync.application.use_cases import SyncResult, Upload
from english_learn_api.sync.domain.limits import (
    EARLIEST_DATE,
    EARLIEST_OCCURRED_AT_MS,
    END_OCCURRED_AT_MS,
    LATEST_DATE,
    MAX_EVENTS_PER_SYNC,
    MAX_PAYLOAD_BYTES,
    MAX_TYPE_LENGTH,
    TYPE_PATTERN,
)
from english_learn_api.sync.domain.models import NewEvent, StoredEvent

# Canonical lowercase form only: clients deduplicate by the exact id string.
_HEX = "[0-9a-f]"
UUID_PATTERN = f"^{_HEX}{{8}}-{_HEX}{{4}}-[1-8]{_HEX}{{3}}-[89ab]{_HEX}{{3}}-{_HEX}{{12}}$"
UUID7_PATTERN = f"^{_HEX}{{8}}-{_HEX}{{4}}-7{_HEX}{{3}}-[89ab]{_HEX}{{3}}-{_HEX}{{12}}$"


def _real_date(value: str) -> str:
    parsed = date.fromisoformat(value)  # ValueError (→ 422) for 2026-02-30
    if not EARLIEST_DATE <= parsed <= LATEST_DATE:
        msg = f"must be between {EARLIEST_DATE} and {LATEST_DATE}"
        raise ValueError(msg)
    return value


def _has_nul(value: object) -> bool:
    match value:
        case str():
            return "\x00" in value
        case dict():
            return any(_has_nul(k) or _has_nul(v) for k, v in value.items())
        case list():
            return any(_has_nul(item) for item in value)
        case _:
            return False


def _bounded_payload(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    except ValueError as error:
        msg = "payload must be plain JSON (no NaN or Infinity)"
        raise ValueError(msg) from error
    if len(encoded.encode()) > MAX_PAYLOAD_BYTES:
        msg = f"payload must encode to at most {MAX_PAYLOAD_BYTES} bytes of JSON"
        raise ValueError(msg)
    if _has_nul(payload):  # PostgreSQL jsonb cannot store U+0000
        msg = "payload must not contain NUL characters"
        raise ValueError(msg)
    return payload


Uuid7String = Annotated[str, StringConstraints(pattern=UUID7_PATTERN)]
UuidString = Annotated[str, StringConstraints(pattern=UUID_PATTERN)]
LocalDateString = Annotated[
    str, StringConstraints(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"), AfterValidator(_real_date)
]
EventType = Annotated[
    str, StringConstraints(min_length=1, max_length=MAX_TYPE_LENGTH, pattern=TYPE_PATTERN)
]
EpochMillis = Annotated[StrictInt, Field(ge=EARLIEST_OCCURRED_AT_MS, lt=END_OCCURRED_AT_MS)]
Payload = Annotated[dict[str, Any], AfterValidator(_bounded_payload)]


class EventRequest(CamelRequest):
    id: Annotated[Uuid7String, Field(description="UUIDv7, lowercase, unique per user")]
    occurred_at: Annotated[EpochMillis, Field(alias="occurredAt", description="Epoch ms")]
    local_date: Annotated[LocalDateString, Field(alias="localDate", description="YYYY-MM-DD")]
    type: Annotated[EventType, Field(description="Unknown types are stored as well")]
    payload: Annotated[Payload, Field(description="Opaque JSON object, at most 8 KiB")]

    def to_event(self) -> NewEvent:
        return NewEvent(
            id=UUID(self.id),
            occurred_at=self.occurred_at,
            local_date=date.fromisoformat(self.local_date),
            type=self.type,
            payload=self.payload,
        )


class SyncRequest(CamelRequest):
    device_id: Annotated[UuidString, Field(alias="deviceId")]
    cursor: Annotated[
        StrictInt | None,
        Field(ge=0, description="`cursor` from the previous response; null on a first sync"),
    ]
    events: Annotated[list[EventRequest], Field(max_length=MAX_EVENTS_PER_SYNC)]

    def to_upload(self) -> Upload:
        return Upload(
            device_id=UUID(self.device_id),
            cursor=self.cursor,
            events=[event.to_event() for event in self.events],
        )


class EventResponse(CamelResponse):
    id: UUID
    device_id: Annotated[UUID, Field(description="The device that uploaded it first")]
    occurred_at: int
    local_date: date
    type: str
    payload: dict[str, Any]

    @classmethod
    def of(cls, event: StoredEvent) -> EventResponse:
        return cls(
            id=event.id,
            device_id=event.device_id,
            occurred_at=event.occurred_at,
            local_date=event.local_date,
            type=event.type,
            payload=event.payload,
        )


class SyncResponse(CamelResponse):
    events: list[EventResponse]
    cursor: Annotated[int, Field(description="Send back as `cursor` next time")]
    has_more: Annotated[bool, Field(description="More events after `cursor`: sync again")]
    accepted: int
    duplicates: int
    conflicts: Annotated[
        list[UUID], Field(description="Ids already stored with other content; first one kept")
    ]

    @classmethod
    def of(cls, result: SyncResult) -> SyncResponse:
        return cls(
            events=[EventResponse.of(event) for event in result.events],
            cursor=result.cursor,
            has_more=result.has_more,
            accepted=result.accepted,
            duplicates=result.duplicates,
            conflicts=result.conflicts,
        )
