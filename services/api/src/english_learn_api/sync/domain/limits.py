"""Bounds of the sync envelope. The server checks shapes and sizes, never what payloads mean."""

from datetime import UTC, date, datetime

MAX_EVENTS_PER_SYNC = 500
"""Events one request may upload."""

PAGE_SIZE = 500
"""Events one response returns at most (`hasMore` tells the client to ask again)."""

MAX_PAYLOAD_BYTES = 8 * 1024
"""Compact UTF-8 JSON encoding of one payload."""

MAX_TYPE_LENGTH = 40

TYPE_PATTERN = r"^[a-z][a-z0-9_]*$"
"""snake_case, like every known type. Unknown types are stored too (forward compatibility)."""

EARLIEST_DATE = date(2000, 1, 1)
LATEST_DATE = date(2099, 12, 31)

EARLIEST_OCCURRED_AT_MS = int(datetime(2000, 1, 1, tzinfo=UTC).timestamp() * 1000)
"""Inclusive. Static bounds: a device with a wrong clock must still be able to sync."""

END_OCCURRED_AT_MS = int(datetime(2100, 1, 1, tzinfo=UTC).timestamp() * 1000)
"""Exclusive."""
