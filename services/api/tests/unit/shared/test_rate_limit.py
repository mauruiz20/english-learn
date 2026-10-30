from datetime import timedelta

import pytest

from english_learn_api.shared.rate_limit import Rate, TokenBucketLimiter

TEN_PER_MINUTE = Rate(requests=10, per=timedelta(minutes=1))


class Clock:
    def __init__(self) -> None:
        self.now = 500.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock() -> Clock:
    return Clock()


def test_allows_a_burst_up_to_the_capacity_then_refuses(clock: Clock) -> None:
    limiter = TokenBucketLimiter(TEN_PER_MINUTE, monotonic=clock)

    assert [limiter.hit("ip") for _ in range(10)] == [0.0] * 10
    assert limiter.hit("ip") == pytest.approx(6.0)  # one token every 6 s


def test_refills_continuously(clock: Clock) -> None:
    limiter = TokenBucketLimiter(TEN_PER_MINUTE, monotonic=clock)
    for _ in range(10):
        limiter.hit("ip")

    clock.now += 3
    assert limiter.hit("ip") == pytest.approx(3.0)
    clock.now += 3
    assert limiter.hit("ip") == 0.0
    assert limiter.hit("ip") > 0


def test_a_refused_hit_does_not_consume(clock: Clock) -> None:
    limiter = TokenBucketLimiter(TEN_PER_MINUTE, monotonic=clock)
    for _ in range(10):
        limiter.hit("ip")
    for _ in range(5):
        limiter.hit("ip")

    clock.now += 6
    assert limiter.hit("ip") == 0.0


def test_keys_are_independent(clock: Clock) -> None:
    limiter = TokenBucketLimiter(Rate(requests=1, per=timedelta(hours=1)), monotonic=clock)

    assert limiter.hit("a") == 0.0
    assert limiter.hit("a") > 0
    assert limiter.hit("b") == 0.0


def test_memory_is_bounded(clock: Clock) -> None:
    limiter = TokenBucketLimiter(TEN_PER_MINUTE, monotonic=clock, max_keys=3)
    for key in ("a", "b", "c"):
        limiter.hit(key)
    clock.now += 60  # a, b and c are full again: forgetting them changes nothing

    limiter.hit("d")

    assert len(limiter) <= 3


def test_when_every_bucket_is_busy_the_least_recently_used_is_dropped(clock: Clock) -> None:
    limiter = TokenBucketLimiter(
        Rate(requests=1, per=timedelta(hours=1)), monotonic=clock, max_keys=2
    )
    limiter.hit("a")
    limiter.hit("b")

    limiter.hit("c")

    assert len(limiter) == 2
    assert limiter.hit("b") > 0  # still tracked
    assert limiter.hit("c") > 0
