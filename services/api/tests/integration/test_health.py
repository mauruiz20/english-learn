import httpx

from english_learn_api.main import create_app
from tests.support import make_settings


async def test_reports_ok_when_the_database_answers(database_url: str) -> None:
    transport = httpx.ASGITransport(app=create_app(make_settings(database_url=database_url)))

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
