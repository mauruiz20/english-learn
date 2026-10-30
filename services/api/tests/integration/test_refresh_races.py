"""Refresh-token races against a real PostgreSQL (READ COMMITTED), with forced interleavings."""

import asyncio
from datetime import timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from english_learn_api.account.application import DeleteAccount
from english_learn_api.auth.application.use_cases import (
    RefreshSession,
    SessionIssuer,
    SignInWithGoogle,
    UnitOfWorkFactory,
)
from english_learn_api.auth.domain.errors import (
    InvalidRefreshTokenError,
    RefreshTokenReuseError,
)
from english_learn_api.auth.infrastructure.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from english_learn_api.shared.database import create_session_factory
from tests.fakes import FakeAccessTokens, FakeClock, FakeGoogleVerifier
from tests.integration.concurrency import (
    Gate,
    PauseBeforeCommit,
    PauseBeforeIssuingARefreshToken,
    wait_until_a_transaction_waits_for_a_lock,
)


class Auth:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine
        self.session_factory = create_session_factory(engine)
        self.clock = FakeClock()
        google = FakeGoogleVerifier()
        google.register("google-ana", sub="sub-ana", email="ana@example.com")
        self.sessions = SessionIssuer(
            access_tokens=FakeAccessTokens(), refresh_token_ttl=timedelta(days=14)
        )
        self.sign_in = SignInWithGoogle(
            verifier=google, sessions=self.sessions, unit_of_work=self.uow, clock=self.clock
        )
        self.refresh = self.refresh_with(self.uow)

    def uow(self) -> SqlAlchemyUnitOfWork:
        return SqlAlchemyUnitOfWork(self.session_factory)

    def refresh_with(self, unit_of_work: UnitOfWorkFactory) -> RefreshSession:
        return RefreshSession(sessions=self.sessions, unit_of_work=unit_of_work, clock=self.clock)

    async def live_tokens(self) -> int:
        async with self.engine.connect() as connection:
            count = await connection.scalar(
                text("SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL")
            )
        return int(count or 0)


@pytest.fixture
def auth(engine: AsyncEngine) -> Auth:
    return Auth(engine)


async def test_reuse_revocation_reaches_a_successor_issued_concurrently(auth: Auth) -> None:
    """Attacker rotates A→B; the victim presents A while the attacker rotates B→C at the same time.

    Whatever the interleaving, C must not survive the reuse revocation.
    """
    a = (await auth.sign_in.execute("google-ana")).tokens.refresh_token
    b = (await auth.refresh.execute(a)).refresh_token
    auth.clock.advance(timedelta(minutes=5))  # well past any retry grace window

    gate = Gate()
    attacker = auth.refresh_with(lambda: PauseBeforeCommit(auth.session_factory, gate))
    attacker_rotation = asyncio.create_task(attacker.execute(b))
    await gate.reached.wait()  # B→C is written, not committed; its locks are held
    victim_reuse = asyncio.create_task(auth.refresh.execute(a))
    await wait_until_a_transaction_waits_for_a_lock(auth.engine)
    gate.opened.set()
    results = await asyncio.gather(attacker_rotation, victim_reuse, return_exceptions=True)

    assert isinstance(results[1], RefreshTokenReuseError)
    if not isinstance(results[0], BaseException):  # the attacker got C before the revocation
        with pytest.raises(InvalidRefreshTokenError):
            await auth.refresh.execute(results[0].refresh_token)
    assert await auth.live_tokens() == 0


class TestRefreshRacingWithAccountDeletion:
    """Neither side may fail with a database error (500); the refresh ends up rejected (401)."""

    async def test_deletion_arrives_while_the_refresh_holds_its_locks(self, auth: Auth) -> None:
        signed_in = await auth.sign_in.execute("google-ana")
        gate = Gate()
        refresh = auth.refresh_with(
            lambda: PauseBeforeIssuingARefreshToken(auth.session_factory, gate)
        )
        delete = DeleteAccount(unit_of_work=auth.uow)

        refreshing = asyncio.create_task(refresh.execute(signed_in.tokens.refresh_token))
        await gate.reached.wait()
        deleting = asyncio.create_task(delete.execute(signed_in.user.id))
        await wait_until_a_transaction_waits_for_a_lock(auth.engine)
        gate.opened.set()
        refreshed, deleted = await asyncio.gather(refreshing, deleting, return_exceptions=True)

        assert deleted is None
        assert not isinstance(refreshed, BaseException), refreshed
        with pytest.raises(InvalidRefreshTokenError):
            await auth.refresh.execute(refreshed.refresh_token)

    async def test_refresh_arrives_while_the_deletion_is_uncommitted(self, auth: Auth) -> None:
        signed_in = await auth.sign_in.execute("google-ana")
        gate = Gate()
        delete = DeleteAccount(unit_of_work=lambda: PauseBeforeCommit(auth.session_factory, gate))

        deleting = asyncio.create_task(delete.execute(signed_in.user.id))
        await gate.reached.wait()
        refreshing = asyncio.create_task(auth.refresh.execute(signed_in.tokens.refresh_token))
        await wait_until_a_transaction_waits_for_a_lock(auth.engine)
        gate.opened.set()
        deleted, refreshed = await asyncio.gather(deleting, refreshing, return_exceptions=True)

        assert deleted is None
        assert isinstance(refreshed, InvalidRefreshTokenError)
