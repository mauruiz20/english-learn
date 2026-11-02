"""`POST /v1/transfers` and `POST /v1/transfers/claim` through the real app and PostgreSQL."""

import asyncio
import hashlib
import json
import logging
import uuid
from collections.abc import AsyncIterator
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from english_learn_api.main import create_app
from english_learn_api.shared.database import create_session_factory
from english_learn_api.shared.logging import JsonFormatter
from english_learn_api.sync.domain.models import NewEvent
from english_learn_api.transfers.api.schemas import CreateTransferRequest
from english_learn_api.transfers.application.use_cases import ClaimTransfer, CreateTransfer
from english_learn_api.transfers.domain.errors import TransferNotFoundError
from english_learn_api.transfers.infrastructure.sqlalchemy_unit_of_work import (
    SqlAlchemyTransferUnitOfWork,
)
from tests.fakes import FakeClock
from tests.integration.concurrency import Gate, wait_until_a_transaction_waits_for_a_lock
from tests.integration.test_rate_limits import assert_rate_limited, client_from
from tests.support import make_settings

OLD_SITE = "https://english-learn-iwl.pages.dev"
APP = "https://english.maumar.com.ar"
NOT_FOUND = {
    "error": {
        "code": "transfer_not_found",
        "message": "This transfer does not exist, expired or was already used",
    }
}


def event(**overrides: Any) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid7()),
        "occurredAt": 1_793_361_600_000,
        "localDate": "2026-10-30",
        "type": "item_reviewed",
        "payload": {"v": 1, "sessionId": "s1", "itemId": "private-item", "grade": 3},
        **overrides,
    }


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def app(database_url: str, clock: FakeClock) -> object:
    return create_app(make_settings(database_url=database_url), clock=clock)


@pytest.fixture
async def client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    async with client_from(app) as client:
        yield client


async def create(client: httpx.AsyncClient, events: list[dict[str, Any]]) -> httpx.Response:
    return await client.post("/v1/transfers", json={"events": events}, headers={"origin": OLD_SITE})


async def claim(client: httpx.AsyncClient, token: str) -> httpx.Response:
    return await client.post("/v1/transfers/claim", json={"token": token}, headers={"origin": APP})


async def created_token(client: httpx.AsyncClient, events: list[dict[str, Any]]) -> str:
    response = await create(client, events)
    assert response.status_code == 201, response.text
    token: str = response.json()["token"]
    return token


async def test_the_new_site_claims_the_old_sites_events_once(client: httpx.AsyncClient) -> None:
    events = [
        event(),
        event(type="session_completed", payload={"v": 1, "answerXp": 10, "s": "ñ"}),
        event(type="baseline_imported", localDate="2026-01-02", payload={"v": 1, "xp": 300}),
    ]

    created = await create(client, events)
    first = await claim(client, created.json()["token"])
    again = await claim(client, created.json()["token"])

    assert created.status_code == 201
    assert created.json()["expiresAt"] == "2026-10-30T12:15:00Z"
    assert len(created.json()["token"]) == 43
    assert created.headers["access-control-allow-origin"] == OLD_SITE
    assert first.status_code == 200
    assert first.json() == {"events": events}
    assert first.headers["access-control-allow-origin"] == APP
    assert (again.status_code, again.json()) == (404, NOT_FOUND)


async def test_unknown_expired_and_claimed_transfers_look_the_same(
    client: httpx.AsyncClient, clock: FakeClock
) -> None:
    claimed = await created_token(client, [event()])
    await claim(client, claimed)
    expired = await created_token(client, [event()])
    clock.advance(timedelta(minutes=15))

    responses = [await claim(client, token) for token in (claimed, expired, "never-issued")]

    assert [(r.status_code, r.json()) for r in responses] == [(404, NOT_FOUND)] * 3


async def test_a_transfer_still_works_just_before_it_expires(
    client: httpx.AsyncClient, clock: FakeClock
) -> None:
    token = await created_token(client, [event()])
    clock.advance(timedelta(minutes=15) - timedelta(milliseconds=1))

    assert (await claim(client, token)).status_code == 200


async def test_only_the_token_hash_is_stored_and_claimed_rows_are_gone(
    client: httpx.AsyncClient, engine: AsyncEngine
) -> None:
    token = await created_token(client, [event()])
    async with engine.connect() as connection:
        rows = (await connection.execute(text("SELECT token_hash, payload FROM transfers"))).all()
    assert [r[0] for r in rows] == [hashlib.sha256(token.encode()).hexdigest()]
    assert token.encode() not in rows[0][1]

    await claim(client, token)

    async with engine.connect() as connection:
        assert await connection.scalar(text("SELECT count(*) FROM transfers")) == 0


async def test_stale_transfers_are_purged_when_another_is_created(
    client: httpx.AsyncClient, engine: AsyncEngine
) -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text(
                """
                INSERT INTO transfers (token_hash, payload, created_at, expires_at, claimed_at)
                VALUES ('expired', 'x', '2026-10-30T11:00Z', '2026-10-30T11:15Z', NULL),
                       ('claimed', NULL, '2026-10-30T11:55Z', '2026-10-30T12:10Z',
                        '2026-10-30T11:56Z'),
                       ('live', 'x', '2026-10-30T11:55Z', '2026-10-30T12:10Z', NULL)
                """
            )
        )

    await created_token(client, [event()])

    async with engine.connect() as connection:
        left = set((await connection.execute(text("SELECT token_hash FROM transfers"))).scalars())
    assert "live" in left
    assert left.isdisjoint({"expired", "claimed"})
    assert len(left) == 2  # the live one and the new one


async def test_the_payload_check_constraint_holds(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        with pytest.raises(Exception, match="payload_until_claimed"):
            await connection.execute(
                text(
                    "INSERT INTO transfers (token_hash, payload, expires_at, claimed_at) "
                    "VALUES ('h', NULL, now(), NULL)"
                )
            )


class TestLimits:
    async def test_a_body_over_two_mib_is_refused(self, client: httpx.AsyncClient) -> None:
        big = {"v": 1, "blob": "x" * 8000}
        response = await create(client, [event(payload=big) for _ in range(270)])

        assert response.status_code == 413
        assert response.json()["error"]["code"] == "payload_too_large"

    async def test_a_body_between_one_and_two_mib_is_accepted(
        self, client: httpx.AsyncClient
    ) -> None:
        big = {"v": 1, "blob": "x" * 8000}
        events = [event(payload=big) for _ in range(200)]
        assert 1024 * 1024 < len(json.dumps({"events": events})) < 2 * 1024 * 1024

        token = await created_token(client, events)

        assert (await claim(client, token)).json() == {"events": events}

    @pytest.mark.parametrize(
        "events",
        [[], [event(id=str(uuid.uuid4()))], [event(localDate="2026-13-01")]],
    )
    async def test_invalid_envelopes_are_refused(
        self, client: httpx.AsyncClient, events: list[dict[str, Any]]
    ) -> None:
        response = await create(client, events)

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


class TestRateLimits:
    async def test_five_creates_per_hour_per_address(self, app: object) -> None:
        async with client_from(app) as client, client_from(app, ip="198.51.100.7") as other:
            statuses = [(await create(client, [event()])).status_code for _ in range(5)]
            limited = await create(client, [event()])
            elsewhere = await create(other, [event()])

        assert statuses == [201] * 5
        assert_rate_limited(limited)
        assert int(limited.headers["retry-after"]) == 720
        assert limited.headers["access-control-allow-origin"] == OLD_SITE
        assert elsewhere.status_code == 201

    async def test_twenty_claims_per_hour_per_address(self, app: object) -> None:
        async with client_from(app) as client:
            statuses = [(await claim(client, f"guess-{n}")).status_code for n in range(20)]
            limited = await claim(client, "guess-21")

        assert statuses == [404] * 20
        assert_rate_limited(limited)
        assert int(limited.headers["retry-after"]) == 180


class TestConcurrentClaims:
    async def test_exactly_one_of_two_racing_claims_gets_the_events(
        self, engine: AsyncEngine, clock: FakeClock
    ) -> None:
        session_factory = create_session_factory(engine)
        gate = Gate()

        class PauseBeforeCommit(SqlAlchemyTransferUnitOfWork):
            async def commit(self) -> None:
                await gate.pass_through()
                await super().commit()

        def plain() -> SqlAlchemyTransferUnitOfWork:
            return SqlAlchemyTransferUnitOfWork(session_factory)

        issued = await CreateTransfer(unit_of_work=plain, clock=clock).execute(
            [_new_event(), _new_event()]
        )
        paused = ClaimTransfer(unit_of_work=lambda: PauseBeforeCommit(session_factory), clock=clock)

        first = asyncio.create_task(paused.execute(issued.token))
        await gate.reached.wait()  # claimed, row lock held, not committed
        second = asyncio.create_task(
            ClaimTransfer(unit_of_work=plain, clock=clock).execute(issued.token)
        )
        await wait_until_a_transaction_waits_for_a_lock(engine)
        gate.opened.set()
        results = await asyncio.gather(first, second, return_exceptions=True)

        assert isinstance(results[0], list)
        assert len(results[0]) == 2
        assert isinstance(results[1], TransferNotFoundError)

    async def test_concurrent_http_claims_hand_the_events_out_once(
        self, client: httpx.AsyncClient
    ) -> None:
        token = await created_token(client, [event()])

        responses = await asyncio.gather(*(claim(client, token) for _ in range(5)))

        assert sorted(r.status_code for r in responses) == [200, 404, 404, 404, 404]


async def test_logs_never_contain_the_token_or_the_events(
    client: httpx.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)

    token = await created_token(client, [event()])
    await claim(client, token)
    await claim(client, token)

    lines = [JsonFormatter().format(record) for record in caplog.records]
    assert any('"path": "/v1/transfers/claim"' in line for line in lines)
    hashed = hashlib.sha256(token.encode()).hexdigest()
    for secret in (token, hashed, "private-item"):
        assert not [line for line in lines if secret in line], secret


def _new_event() -> NewEvent:
    return CreateTransferRequest.model_validate({"events": [event()]}).to_events()[0]
