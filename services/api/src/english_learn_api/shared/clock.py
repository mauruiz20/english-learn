from datetime import UTC, datetime
from typing import Protocol


class Clock(Protocol):
    """Time is a port: use cases never call `datetime.now()` directly, so tests control it."""

    def now(self) -> datetime:
        """The current instant, timezone-aware in UTC."""
        ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)
