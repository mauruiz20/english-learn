"""In-process token-bucket rate limiting, exposed to routes as FastAPI dependencies.

State lives in this process's memory, which is right for the single instance we run. With more
than one instance each keeps its own buckets (the effective limit multiplies by the instance
count); a shared store such as Redis would be needed then.

Per-IP limits key on the address from the app's single `ClientIpResolver` (see `client_ip`):
the TCP peer, or Cloudflare's `CF-Connecting-IP` from a trusted proxy; IPv6 addresses by their /64
(`rate_limit_key`).
"""

import math
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import timedelta

from fastapi import Request

from english_learn_api.shared.client_ip import ClientIpResolver, rate_limit_key
from english_learn_api.shared.errors import ApiError

DEFAULT_MAX_KEYS = 10_000


@dataclass(frozen=True, slots=True)
class Rate:
    """`requests` per `per`, allowed in a burst and refilled continuously."""

    requests: int
    per: timedelta

    @property
    def tokens_per_second(self) -> float:
        return self.requests / self.per.total_seconds()


@dataclass(slots=True)
class _Bucket:
    tokens: float
    updated: float


class TokenBucketLimiter:
    def __init__(
        self,
        rate: Rate,
        *,
        monotonic: Callable[[], float] = time.monotonic,
        max_keys: int = DEFAULT_MAX_KEYS,
    ) -> None:
        self._rate = rate
        self._monotonic = monotonic
        self._max_keys = max_keys
        self._buckets: OrderedDict[str, _Bucket] = OrderedDict()
        self._last_sweep = -math.inf

    def __len__(self) -> int:
        return len(self._buckets)

    def hit(self, key: str) -> float:
        """Take a token for `key`. Returns 0 if allowed, else the seconds until one is free."""
        now = self._monotonic()
        bucket = self._buckets.get(key)
        if bucket is None:
            self._make_room(now)
            bucket = self._buckets[key] = _Bucket(float(self._rate.requests), now)
        else:
            self._buckets.move_to_end(key)
            self._refill(bucket, now)
        if bucket.tokens >= 1:
            bucket.tokens -= 1
            return 0.0
        return (1 - bucket.tokens) / self._rate.tokens_per_second

    def _refill(self, bucket: _Bucket, now: float) -> None:
        elapsed = now - bucket.updated
        bucket.tokens = min(
            float(self._rate.requests), bucket.tokens + elapsed * self._rate.tokens_per_second
        )
        bucket.updated = now

    def _make_room(self, now: float) -> None:
        if len(self._buckets) < self._max_keys:
            return
        # Full buckets carry no information: forgetting them changes nothing. The sweep is
        # O(keys), so a flood of new client addresses triggers it at most once per second.
        if now - self._last_sweep >= 1:
            self._last_sweep = now
            for key, bucket in list(self._buckets.items()):
                self._refill(bucket, now)
                if bucket.tokens >= self._rate.requests:
                    del self._buckets[key]
        while len(self._buckets) >= self._max_keys:
            self._buckets.popitem(last=False)  # least recently used


def enforce(limiter: TokenBucketLimiter, key: str) -> None:
    """Raise 429 `rate_limited` with `Retry-After` when `key` is over its rate."""
    retry_after = limiter.hit(key)
    if retry_after > 0:
        raise ApiError(
            429,
            "rate_limited",
            "Too many requests; try again later",
            headers={"Retry-After": str(max(1, math.ceil(retry_after)))},
        )


def limit_by_client_ip(
    limiter: TokenBucketLimiter, client_ip: ClientIpResolver
) -> Callable[[Request], Awaitable[None]]:
    async def dependency(request: Request) -> None:
        enforce(limiter, rate_limit_key(client_ip(request)))

    return dependency
