import httpx

from english_learn_api.main import create_app
from tests.support import make_settings


async def test_reports_503_when_the_database_is_unreachable() -> None:
    # Port 1 on localhost refuses connections immediately.
    app = create_app(make_settings(database_url="postgresql://u:p@127.0.0.1:1/db"))
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/healthz")

    assert response.status_code == 503
    assert response.json() == {
        "error": {"code": "database_unavailable", "message": "Database is unreachable"}
    }
