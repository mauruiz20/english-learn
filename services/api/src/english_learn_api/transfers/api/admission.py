"""Admission of transfer requests, decided before their body is read.

FastAPI reads and parses a body before route dependencies run, so a limit taken as a dependency
would still let a refused client make the server parse up to 2 MiB. These checks run in
`AdmissionMiddleware` (keyed on the exact path) and refuse without touching the body:

- per client address (IPv6 by /64): 429 `rate_limited`;
- creates by everyone together: 503 `transfer_capacity`;
- creates in progress at once: callers wait briefly for a slot, then get 503 `busy`.
"""

import asyncio
import math
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from starlette.requests import Request

from english_learn_api.shared.client_ip import ClientIpResolver, rate_limit_key
from english_learn_api.shared.errors import ApiError
from english_learn_api.shared.middleware import Admission
from english_learn_api.shared.rate_limit import TokenBucketLimiter, enforce

DEFAULT_MAX_CONCURRENT_CREATES = 2
DEFAULT_CREATE_WAIT_SECONDS = 0.5
_EVERYONE = "*"


class ConcurrencySlots:
    """At most `max_concurrent` holders; a caller waits up to `wait_seconds`, then gets 503."""

    def __init__(self, max_concurrent: int, wait_seconds: float) -> None:
        self._slots = asyncio.Semaphore(max_concurrent)
        self._wait_seconds = wait_seconds

    @asynccontextmanager
    async def hold(self) -> AsyncIterator[None]:
        try:
            async with asyncio.timeout(self._wait_seconds):
                await self._slots.acquire()
        except TimeoutError as error:
            raise ApiError(
                503,
                "busy",
                "Too many transfers in progress; try again shortly",
                headers={"Retry-After": "1"},
            ) from error
        try:
            yield
        finally:
            self._slots.release()


def create_admission(
    *,
    per_client: TokenBucketLimiter,
    everyone: TokenBucketLimiter,
    slots: ConcurrencySlots,
    client_ip: ClientIpResolver,
) -> Admission:
    @asynccontextmanager
    async def admit(request: Request) -> AsyncIterator[None]:
        enforce(per_client, rate_limit_key(client_ip(request)))
        retry_after = everyone.hit(_EVERYONE)
        if retry_after > 0:
            raise ApiError(
                503,
                "transfer_capacity",
                "Too many transfers right now; try again later",
                headers={"Retry-After": str(max(1, math.ceil(retry_after)))},
            )
        async with slots.hold():
            yield

    return admit


def claim_admission(*, per_client: TokenBucketLimiter, client_ip: ClientIpResolver) -> Admission:
    @asynccontextmanager
    async def admit(request: Request) -> AsyncIterator[None]:
        enforce(per_client, rate_limit_key(client_ip(request)))
        yield

    return admit
