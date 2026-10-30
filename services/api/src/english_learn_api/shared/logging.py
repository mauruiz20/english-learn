"""JSON log lines on stdout. Callers pass structured context through `extra={...}`.

Convention: never log tokens, ID tokens or emails; identify users by their opaque id.
"""

import json
import logging
import sys
from datetime import UTC, datetime
from typing import override

_STANDARD_ATTRIBUTES = frozenset(
    logging.LogRecord("", 0, "", 0, "", None, None).__dict__.keys() | {"message", "asctime"}
)


class JsonFormatter(logging.Formatter):
    @override
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        entry.update(
            (key, value)
            for key, value in record.__dict__.items()
            if key not in _STANDARD_ATTRIBUTES and not key.startswith("_")
        )
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # Uvicorn's access log would duplicate RequestLogMiddleware.
    logging.getLogger("uvicorn.access").disabled = True
