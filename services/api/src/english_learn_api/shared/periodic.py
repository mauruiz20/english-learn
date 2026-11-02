"""A task repeated in the background while the app runs (its lifespan starts and cancels it)."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import timedelta

logger = logging.getLogger(__name__)

type Sleep = Callable[[float], Awaitable[None]]


async def run_periodically(
    task: Callable[[], Awaitable[object]],
    interval: timedelta,
    *,
    name: str,
    sleep: Sleep = asyncio.sleep,
) -> None:
    """Runs `task` after every `interval` until cancelled. A failed run is logged (its type only:
    messages may carry data) and the next run happens as usual."""
    seconds = interval.total_seconds()
    while True:
        await sleep(seconds)
        try:
            await task()
        except Exception as error:
            logger.warning(
                "periodic task failed", extra={"task": name, "error": type(error).__name__}
            )
