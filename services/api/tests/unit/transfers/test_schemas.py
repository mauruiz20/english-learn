"""Bodies of `POST /v1/transfers` and `POST /v1/transfers/claim`: the sync envelope rules."""

import json
import uuid
from datetime import date
from typing import Any

import pytest
from pydantic import ValidationError

from english_learn_api.sync.domain.limits import MAX_PAYLOAD_BYTES
from english_learn_api.sync.domain.models import NewEvent
from english_learn_api.transfers.api.schemas import (
    ClaimTransferRequest,
    ClaimTransferResponse,
    CreateTransferRequest,
)
from english_learn_api.transfers.domain.limits import MAX_EVENTS_PER_TRANSFER

EVENT_ID = "019a3456-7890-7abc-8def-0123456789ab"


def envelope(**overrides: Any) -> dict[str, Any]:
    return {
        "id": EVENT_ID,
        "occurredAt": 1_793_361_600_000,
        "localDate": "2026-10-30",
        "type": "item_reviewed",
        "payload": {"v": 1, "sessionId": "s1", "itemId": "i1", "grade": 3},
        **overrides,
    }


def parse(value: dict[str, Any]) -> CreateTransferRequest:
    return CreateTransferRequest.model_validate_json(json.dumps(value))


def test_a_valid_body_becomes_events() -> None:
    [event] = parse({"events": [envelope()]}).to_events()

    assert event == NewEvent(
        id=uuid.UUID(EVENT_ID),
        occurred_at=1_793_361_600_000,
        local_date=date(2026, 10, 30),
        type="item_reviewed",
        payload={"v": 1, "sessionId": "s1", "itemId": "i1", "grade": 3},
    )


def test_allows_up_to_twenty_thousand_events() -> None:
    assert MAX_EVENTS_PER_TRANSFER == 20_000
    events = [envelope(id=str(uuid.uuid7())) for _ in range(MAX_EVENTS_PER_TRANSFER)]

    assert len(parse({"events": events}).events) == MAX_EVENTS_PER_TRANSFER
    with pytest.raises(ValidationError):
        parse({"events": [*events, envelope()]})


@pytest.mark.parametrize(
    "body",
    [
        {"events": []},
        {},
        {"events": [envelope()], "deviceId": "6f1c2a4e-0b1d-4c2e-9f3a-5b6c7d8e9f01"},
        {"events": [envelope(id="6f1c2a4e-0b1d-4c2e-9f3a-5b6c7d8e9f01")]},  # UUIDv4
        {"events": [envelope(localDate="2026-02-30")]},
        {"events": [envelope(occurredAt=1.5)]},
        {"events": [envelope(type="Item Reviewed")]},
        {"events": [envelope(payload={"blob": "x" * MAX_PAYLOAD_BYTES})]},
        {"events": [envelope(extra=1)]},
    ],
)
def test_refuses_what_sync_refuses_and_empty_transfers(body: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        parse(body)


@pytest.mark.parametrize("token", ["", "x" * 129])
def test_claim_needs_a_plausible_token(token: str) -> None:
    with pytest.raises(ValidationError):
        ClaimTransferRequest.model_validate({"token": token})


def test_claimed_events_use_the_wire_envelope() -> None:
    event = parse({"events": [envelope()]}).to_events()[0]

    body = ClaimTransferResponse.of([event]).model_dump(mode="json")

    assert body == {"events": [envelope()]}
