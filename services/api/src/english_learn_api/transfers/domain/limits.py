"""Bounds of a progress transfer: one learner's whole log, carried once between two web origins."""

from datetime import timedelta

MAX_EVENTS_PER_TRANSFER = 20_000
"""Events one transfer may carry (every event of the old site's log)."""

MAX_TRANSFER_BODY_BYTES = 2 * 1024 * 1024
"""Request body of `POST /v1/transfers`; every other route keeps `MAX_REQUEST_BODY_BYTES`."""

TRANSFER_TTL = timedelta(minutes=15)
"""A transfer not claimed within this time is gone."""

PURGE_BATCH = 100
"""Expired or claimed transfers deleted at most per create or claim (no background job)."""

MAX_LIVE_TRANSFERS = 200
"""Unclaimed, unexpired transfers kept at once; creates beyond it get 503 `transfer_capacity`."""

MAX_LIVE_TRANSFER_BYTES = 200 * 1024 * 1024
"""Compressed payload bytes of those transfers together; same refusal beyond it."""
