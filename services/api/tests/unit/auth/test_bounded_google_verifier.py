import asyncio

import pytest

from english_learn_api.auth.domain.errors import GoogleBusyError
from english_learn_api.auth.domain.models import GoogleIdentity
from english_learn_api.auth.infrastructure.bounded_google_verifier import BoundedGoogleVerifier

ANA = GoogleIdentity(sub="sub-ana", email="ana@example.com")


class SlowVerifier:
    def __init__(self) -> None:
        self.release = asyncio.Event()
        self.running = 0

    async def verify(self, id_token: str) -> GoogleIdentity:
        self.running += 1
        try:
            await self.release.wait()
            return ANA
        finally:
            self.running -= 1


async def test_refuses_when_saturated_beyond_the_wait() -> None:
    inner = SlowVerifier()
    bounded = BoundedGoogleVerifier(inner, max_concurrent=2, wait_seconds=0.05)
    in_flight = [asyncio.create_task(bounded.verify("t")) for _ in range(2)]
    await asyncio.sleep(0)

    with pytest.raises(GoogleBusyError):
        await bounded.verify("t")

    assert inner.running == 2
    inner.release.set()
    assert await asyncio.gather(*in_flight) == [ANA, ANA]


async def test_a_caller_waits_briefly_for_a_free_slot() -> None:
    inner = SlowVerifier()
    bounded = BoundedGoogleVerifier(inner, max_concurrent=1, wait_seconds=1)
    first = asyncio.create_task(bounded.verify("t"))
    await asyncio.sleep(0)
    second = asyncio.create_task(bounded.verify("t"))
    await asyncio.sleep(0.01)

    inner.release.set()

    assert list(await asyncio.gather(first, second)) == [ANA, ANA]


async def test_a_failed_verification_frees_its_slot() -> None:
    class Failing:
        async def verify(self, id_token: str) -> GoogleIdentity:
            raise RuntimeError

    bounded = BoundedGoogleVerifier(Failing(), max_concurrent=1, wait_seconds=0.01)
    for _ in range(3):
        with pytest.raises(RuntimeError):
            await bounded.verify("t")
