"""Envelope validation of `POST /v1/sync` bodies. The payload is checked for shape and size only."""

import json
import uuid
from datetime import date
from typing import Any

import pytest
from pydantic import ValidationError

from english_learn_api.sync.api.schemas import SyncRequest
from english_learn_api.sync.domain.limits import MAX_EVENTS_PER_SYNC, MAX_PAYLOAD_BYTES

DEVICE = "6f1c2a4e-0b1d-4c2e-9f3a-5b6c7d8e9f01"
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


def body(**overrides: Any) -> dict[str, Any]:
    return {"deviceId": DEVICE, "cursor": None, "events": [envelope()], **overrides}


def parse(value: dict[str, Any] | str) -> SyncRequest:
    raw = value if isinstance(value, str) else json.dumps(value)
    return SyncRequest.model_validate_json(raw)


def test_a_valid_body_becomes_an_upload() -> None:
    upload = parse(body(cursor=41)).to_upload()

    assert upload.device_id == uuid.UUID(DEVICE)
    assert upload.cursor == 41
    [event] = upload.events
    assert event.id == uuid.UUID(EVENT_ID)
    assert event.occurred_at == 1_793_361_600_000
    assert event.local_date == date(2026, 10, 30)
    assert event.type == "item_reviewed"
    assert event.payload == {"v": 1, "sessionId": "s1", "itemId": "i1", "grade": 3}


def test_unknown_event_types_are_accepted_for_forward_compatibility() -> None:
    upload = parse(body(events=[envelope(type="streak_frozen_v2", payload={})])).to_upload()

    assert upload.events[0].type == "streak_frozen_v2"


def test_an_empty_batch_with_a_null_cursor_is_a_plain_download() -> None:
    upload = parse(body(events=[])).to_upload()

    assert (upload.cursor, upload.events) == (None, [])


@pytest.mark.parametrize(
    "event_id",
    [
        "6f1c2a4e-0b1d-4c2e-9f3a-5b6c7d8e9f01",  # version 4
        "019a3456-7890-7abc-cdef-0123456789ab",  # variant 110
        "019A3456-7890-7ABC-8DEF-0123456789AB",  # uppercase: clients dedupe by the exact string
        "019a345678907abc8def0123456789ab",  # no hyphens
        "urn:uuid:019a3456-7890-7abc-8def-0123456789ab",
        "",
        42,
    ],
)
def test_event_ids_must_be_canonical_uuidv7(event_id: object) -> None:
    with pytest.raises(ValidationError):
        parse(body(events=[envelope(id=event_id)]))


@pytest.mark.parametrize(
    "device_id", ["not-a-uuid", "6F1C2A4E-0B1D-4C2E-9F3A-5B6C7D8E9F01", "", None]
)
def test_the_device_id_must_be_a_canonical_uuid(device_id: object) -> None:
    with pytest.raises(ValidationError):
        parse(body(deviceId=device_id))


@pytest.mark.parametrize(
    "occurred_at",
    [
        1.5,
        "1793361600000",
        True,
        None,
        946_684_799_999,  # before 2000-01-01
        4_102_444_800_000,  # 2100-01-01: the first excluded instant
    ],
)
def test_occurred_at_must_be_epoch_ms_in_a_sane_range(occurred_at: object) -> None:
    with pytest.raises(ValidationError):
        parse(body(events=[envelope(occurredAt=occurred_at)]))


def test_occurred_at_bounds_are_inclusive_at_2000_and_exclusive_at_2100() -> None:
    low = parse(body(events=[envelope(occurredAt=946_684_800_000)])).to_upload()
    high = parse(body(events=[envelope(occurredAt=4_102_444_799_999)])).to_upload()

    assert low.events[0].occurred_at == 946_684_800_000
    assert high.events[0].occurred_at == 4_102_444_799_999


@pytest.mark.parametrize(
    "local_date",
    ["2026-02-30", "2026-1-5", "20261030", "2026-10-30T00:00:00", "1999-12-31", "2100-01-01", 0],
)
def test_local_date_must_be_a_real_yyyy_mm_dd_date(local_date: object) -> None:
    with pytest.raises(ValidationError):
        parse(body(events=[envelope(localDate=local_date)]))


@pytest.mark.parametrize(
    "event_type", ["", "x" * 41, "Item_Reviewed", "item reviewed", "1st", "item-reviewed", 7]
)
def test_type_must_be_a_short_snake_case_name(event_type: object) -> None:
    with pytest.raises(ValidationError):
        parse(body(events=[envelope(type=event_type)]))


def test_a_forty_character_type_is_accepted() -> None:
    assert parse(body(events=[envelope(type="x" * 40)])).to_upload().events[0].type == "x" * 40


@pytest.mark.parametrize("payload", [[], "text", 1, None])
def test_the_payload_must_be_a_json_object(payload: object) -> None:
    with pytest.raises(ValidationError):
        parse(body(events=[envelope(payload=payload)]))


def payload_of_size(size: int) -> dict[str, str]:
    """A payload whose compact JSON encoding is exactly `size` bytes."""
    overhead = len(b'{"pad":""}')
    return {"pad": "x" * (size - overhead)}


def test_payloads_up_to_eight_kilobytes_are_accepted() -> None:
    payload = payload_of_size(MAX_PAYLOAD_BYTES)

    assert parse(body(events=[envelope(payload=payload)])).to_upload().events[0].payload == payload


def test_payloads_over_eight_kilobytes_are_refused() -> None:
    with pytest.raises(ValidationError, match="payload"):
        parse(body(events=[envelope(payload=payload_of_size(MAX_PAYLOAD_BYTES + 1))]))


def test_payload_size_counts_utf8_bytes_not_characters() -> None:
    accents = {"pad": "é" * (MAX_PAYLOAD_BYTES // 2)}  # 2 bytes each in UTF-8

    with pytest.raises(ValidationError, match="payload"):
        parse(body(events=[envelope(payload=accents)]))


@pytest.mark.parametrize(
    "payload", [{"text": "a\u0000b"}, {"a\u0000": 1}, {"nested": [{"deep": "\u0000"}]}]
)
def test_payloads_with_nul_characters_are_refused(payload: dict[str, Any]) -> None:
    # PostgreSQL jsonb cannot store U+0000; refusing it here keeps it a 422 instead of a 500.
    with pytest.raises(ValidationError, match="payload"):
        parse(body(events=[envelope(payload=payload)]))


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
def test_payloads_with_non_json_numbers_are_refused(literal: str) -> None:
    raw = json.dumps(body()).replace('"grade": 3', f'"grade": {literal}')

    with pytest.raises(ValidationError):
        parse(raw)


def test_batches_over_the_limit_are_refused() -> None:
    events = [envelope() for _ in range(MAX_EVENTS_PER_SYNC + 1)]

    with pytest.raises(ValidationError, match="events"):
        parse(body(events=events))


def test_a_full_batch_is_accepted() -> None:
    events = [envelope() for _ in range(MAX_EVENTS_PER_SYNC)]

    assert len(parse(body(events=events)).to_upload().events) == MAX_EVENTS_PER_SYNC


@pytest.mark.parametrize("cursor", [-1, 1.5, "3", True])
def test_the_cursor_must_be_a_non_negative_integer_or_null(cursor: object) -> None:
    with pytest.raises(ValidationError):
        parse(body(cursor=cursor))


@pytest.mark.parametrize(
    "value",
    [
        body(extra=1),
        body(events=[envelope(deviceId=DEVICE)]),
        {"deviceId": DEVICE, "events": []},  # cursor is required (null on a first sync)
        {"deviceId": DEVICE, "cursor": None},
    ],
)
def test_unknown_or_missing_fields_are_refused(value: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        parse(value)
