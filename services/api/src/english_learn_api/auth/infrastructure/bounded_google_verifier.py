"""Caps concurrent Google ID token verifications.

Each verification occupies a worker thread (google-auth is synchronous) and may wait on Google's
certificate endpoint, so a burst of sign-ins could exhaust the thread pool that the rest of the
app shares. Callers wait briefly for a slot; beyond that they get 503 `google_busy`.
"""

import asyncio

from english_learn_api.auth.application.ports import GoogleTokenVerifier
from english_learn_api.auth.domain.errors import GoogleBusyError
from english_learn_api.auth.domain.models import GoogleIdentity

DEFAULT_MAX_CONCURRENT = 8
DEFAULT_WAIT_SECONDS = 2.0


class BoundedGoogleVerifier:
    def __init__(
        self,
        inner: GoogleTokenVerifier,
        *,
        max_concurrent: int = DEFAULT_MAX_CONCURRENT,
        wait_seconds: float = DEFAULT_WAIT_SECONDS,
    ) -> None:
        self._inner = inner
        self._slots = asyncio.Semaphore(max_concurrent)
        self._wait_seconds = wait_seconds

    async def verify(self, id_token: str) -> GoogleIdentity:
        try:
            async with asyncio.timeout(self._wait_seconds):
                await self._slots.acquire()
        except TimeoutError as error:
            msg = "Too many sign-ins in progress; try again shortly"
            raise GoogleBusyError(msg) from error
        try:
            return await self._inner.verify(id_token)
        finally:
            self._slots.release()
