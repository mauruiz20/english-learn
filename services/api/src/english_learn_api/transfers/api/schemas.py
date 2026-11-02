"""Transfer bodies. Events follow exactly the `POST /v1/sync` envelope rules."""

from collections.abc import Sequence
from datetime import datetime
from typing import Annotated, Any

from pydantic import Field

from english_learn_api.auth.api.schemas import CamelRequest, CamelResponse
from english_learn_api.sync.api.schemas import EventRequest
from english_learn_api.sync.domain.models import NewEvent
from english_learn_api.transfers.domain.limits import MAX_EVENTS_PER_TRANSFER
from english_learn_api.transfers.domain.models import IssuedTransfer


class CreateTransferRequest(CamelRequest):
    events: Annotated[
        list[EventRequest],
        Field(
            min_length=1,
            max_length=MAX_EVENTS_PER_TRANSFER,
            description="Every event of the device's log, as `POST /v1/sync` uploads them",
        ),
    ]

    def to_events(self) -> list[NewEvent]:
        return [event.to_event() for event in self.events]


class CreateTransferResponse(CamelResponse):
    token: Annotated[
        str, Field(description="Secret, single use: pass it to the new site in the URL fragment")
    ]
    expires_at: datetime

    @classmethod
    def of(cls, issued: IssuedTransfer) -> CreateTransferResponse:
        return cls(token=issued.token, expires_at=issued.expires_at)


class ClaimTransferRequest(CamelRequest):
    token: Annotated[str, Field(min_length=1, max_length=128)]


class TransferredEvent(CamelResponse):
    """An event as it was uploaded (no device: the claiming device adopts it)."""

    id: str
    occurred_at: int
    local_date: str
    type: str
    payload: dict[str, Any]

    @classmethod
    def of(cls, event: NewEvent) -> TransferredEvent:
        return cls(
            id=str(event.id),
            occurred_at=event.occurred_at,
            local_date=event.local_date.isoformat(),
            type=event.type,
            payload=event.payload,
        )


class ClaimTransferResponse(CamelResponse):
    events: list[TransferredEvent]

    @classmethod
    def of(cls, events: Sequence[NewEvent]) -> ClaimTransferResponse:
        return cls(events=[TransferredEvent.of(event) for event in events])
