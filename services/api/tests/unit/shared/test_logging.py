import json
import logging

import httpx
import pytest

from english_learn_api.main import create_app
from english_learn_api.shared.logging import JsonFormatter
from tests.support import make_settings


def test_json_formatter_includes_structured_extras() -> None:
    record = logging.LogRecord("app", logging.INFO, __file__, 1, "hello %s", ("world",), None)
    record.__dict__["http"] = {"status": 200}

    entry = json.loads(JsonFormatter().format(record))

    assert entry["message"] == "hello world"
    assert entry["level"] == "INFO"
    assert entry["http"] == {"status": 200}


async def test_request_log_has_no_body_or_query(caplog: pytest.LogCaptureFixture) -> None:
    app = create_app(make_settings())
    transport = httpx.ASGITransport(app=app)
    caplog.set_level(logging.INFO, logger="english_learn_api.request")

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/nope?token=secret-query", json={"idToken": "secret-body"})

    (record,) = [r for r in caplog.records if r.name == "english_learn_api.request"]
    line = JsonFormatter().format(record)
    assert json.loads(line)["http"] == {
        "method": "POST",
        "path": "/nope",
        "status": 404,
        "duration_ms": record.__dict__["http"]["duration_ms"],
    }
    assert "secret" not in line
