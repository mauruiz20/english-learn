"""The stored payload's encoding: zlib-compressed JSON, decompressed under a hard bound."""

import uuid
import zlib
from datetime import date

import pytest

from english_learn_api.sync.domain.models import NewEvent
from english_learn_api.transfers.domain.errors import CorruptTransferError
from english_learn_api.transfers.domain.limits import MAX_DECOMPRESSED_TRANSFER_BYTES
from english_learn_api.transfers.infrastructure.sqlalchemy_store import decode_events, encode_events


def event() -> NewEvent:
    return NewEvent(
        id=uuid.uuid7(),
        occurred_at=1_793_361_600_000,
        local_date=date(2026, 10, 30),
        type="item_reviewed",
        payload={"v": 1, "itemId": "ñandú"},
    )


def test_events_round_trip() -> None:
    events = [event(), event()]

    assert decode_events(encode_events(events)) == events


def test_the_bound_is_eight_mib() -> None:
    assert MAX_DECOMPRESSED_TRANSFER_BYTES == 8 * 1024 * 1024


def test_a_payload_just_within_the_bound_decodes() -> None:
    blob = zlib.compress(b"[" + b" " * (MAX_DECOMPRESSED_TRANSFER_BYTES - 2) + b"]")

    assert decode_events(blob) == []


def test_a_payload_that_inflates_past_the_bound_is_corrupt() -> None:
    bomb = zlib.compress(b"[" + b" " * MAX_DECOMPRESSED_TRANSFER_BYTES + b"]")
    assert len(bomb) < 64 * 1024

    with pytest.raises(CorruptTransferError) as raised:
        decode_events(bomb)

    assert "  " not in str(raised.value)


@pytest.mark.parametrize(
    "payload",
    [
        b"not zlib",
        zlib.compress(b"[1, 2"),  # truncated JSON
        zlib.compress(b'[{"id": "x"}]'),  # not an event
        zlib.compress(b"[]")[:-3],  # truncated stream
    ],
)
def test_undecodable_payloads_are_corrupt(payload: bytes) -> None:
    with pytest.raises(CorruptTransferError):
        decode_events(payload)
