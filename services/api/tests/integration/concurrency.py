"""Deterministic interleavings against a real PostgreSQL.

A use case runs in a `PausingUnitOfWork` that stops at a chosen point with its transaction (and
locks) still open; the test then starts a competing transaction, waits until PostgreSQL reports it
blocked on a lock, and releases the first one.
"""

import asyncio
from typing import Self

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from english_learn_api.auth.domain.models import RefreshToken
from english_learn_api.auth.infrastructure.sqlalchemy_repositories import (
    SqlAlchemyRefreshTokenRepository,
)
from english_learn_api.auth.infrastructure.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork

LOCK_WAIT_TIMEOUT_SECONDS = 10


class Gate:
    """`reached` is set when the paused transaction gets to its pause point; `opened` lets it go."""

    def __init__(self) -> None:
        self.reached = asyncio.Event()
        self.opened = asyncio.Event()

    async def pass_through(self) -> None:
        self.reached.set()
        await self.opened.wait()


class PauseBeforeCommit(SqlAlchemyUnitOfWork):
    def __init__(self, session_factory: async_sessionmaker[AsyncSession], gate: Gate) -> None:
        super().__init__(session_factory)
        self._gate = gate

    async def commit(self) -> None:
        await self._gate.pass_through()
        await super().commit()


class _PausingRefreshTokens(SqlAlchemyRefreshTokenRepository):
    def __init__(self, session: AsyncSession, gate: Gate) -> None:
        super().__init__(session)
        self._gate = gate

    async def add(self, token: RefreshToken) -> None:
        await self._gate.pass_through()
        await super().add(token)


class PauseBeforeIssuingARefreshToken(SqlAlchemyUnitOfWork):
    def __init__(self, session_factory: async_sessionmaker[AsyncSession], gate: Gate) -> None:
        super().__init__(session_factory)
        self._gate = gate

    async def __aenter__(self) -> Self:
        await super().__aenter__()
        self.refresh_tokens = _PausingRefreshTokens(self._session, self._gate)
        return self


async def wait_until_a_transaction_waits_for_a_lock(engine: AsyncEngine) -> None:
    query = text(
        "SELECT count(*) FROM pg_stat_activity "
        "WHERE datname = current_database() AND wait_event_type = 'Lock'"
    )
    async with asyncio.timeout(LOCK_WAIT_TIMEOUT_SECONDS):
        while True:
            async with engine.connect() as connection:
                if await connection.scalar(query):
                    return
            await asyncio.sleep(0.02)
