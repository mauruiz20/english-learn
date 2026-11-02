import asyncio
import logging
from datetime import timedelta

import pytest

from english_learn_api.shared.periodic import run_periodically


class StopLoopError(Exception):
    pass


async def test_runs_the_task_after_each_interval_and_survives_its_failures(
    caplog: pytest.LogCaptureFixture,
) -> None:
    sleeps: list[float] = []
    runs = 0

    async def sleep(seconds: float) -> None:
        sleeps.append(seconds)
        if len(sleeps) == 4:
            raise StopLoopError

    async def task() -> None:
        nonlocal runs
        runs += 1
        if runs == 2:
            msg = "database went away"
            raise OSError(msg)

    with pytest.raises(StopLoopError):
        await run_periodically(task, timedelta(minutes=5), name="purge", sleep=sleep)

    assert sleeps == [300.0] * 4
    assert runs == 3
    failures = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert [r.getMessage() for r in failures] == ["periodic task failed"]
    assert "database went away" not in caplog.text


async def test_cancellation_stops_it() -> None:
    started = asyncio.Event()

    async def task() -> None:
        started.set()

    loop = asyncio.create_task(run_periodically(task, timedelta(milliseconds=1), name="t"))
    await started.wait()
    loop.cancel()

    with pytest.raises(asyncio.CancelledError):
        await loop
