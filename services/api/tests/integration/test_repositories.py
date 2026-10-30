import asyncio
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from english_learn_api.auth.application.use_cases import RefreshSession, SessionIssuer
from english_learn_api.auth.domain.models import GoogleIdentity, RefreshFamily, RefreshToken, User
from english_learn_api.auth.domain.refresh_secrets import hash_refresh_secret
from english_learn_api.auth.infrastructure.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from english_learn_api.shared.database import create_session_factory
from tests.fakes import T0, FakeAccessTokens, FakeClock

ANA = GoogleIdentity(sub="sub-ana", email="ana@example.com")


@pytest.fixture
def uow(engine: AsyncEngine) -> SqlAlchemyUnitOfWork:
    return SqlAlchemyUnitOfWork(create_session_factory(engine))


def new_uow(engine: AsyncEngine) -> SqlAlchemyUnitOfWork:
    return SqlAlchemyUnitOfWork(create_session_factory(engine))


async def create_user(engine: AsyncEngine, identity: GoogleIdentity = ANA) -> User:
    async with new_uow(engine) as uow:
        user, _ = await uow.users.upsert_by_google_sub(identity, uuid.uuid7(), T0)
        await uow.commit()
    return user


async def create_family(engine: AsyncEngine, user: User) -> uuid.UUID:
    family = RefreshFamily(id=uuid.uuid7(), user_id=user.id, created_at=T0)
    async with new_uow(engine) as uow:
        await uow.refresh_families.add(family)
        await uow.commit()
    return family.id


def refresh_token(user: User, family_id: uuid.UUID, token_hash: str) -> RefreshToken:
    return RefreshToken(
        id=uuid.uuid7(),
        user_id=user.id,
        family_id=family_id,
        token_hash=token_hash,
        created_at=T0,
        expires_at=T0 + timedelta(days=30),
    )


class TestUsers:
    async def test_upsert_inserts_a_new_user(self, engine: AsyncEngine) -> None:
        new_id = uuid.uuid7()
        async with new_uow(engine) as uow:
            user, created = await uow.users.upsert_by_google_sub(ANA, new_id, T0)
            await uow.commit()

        assert created
        assert user == User(id=new_id, google_sub="sub-ana", email="ana@example.com", created_at=T0)
        async with new_uow(engine) as uow:
            assert await uow.users.get(new_id) == user

    async def test_upsert_updates_the_email_of_an_existing_user(self, engine: AsyncEngine) -> None:
        original = await create_user(engine)

        async with new_uow(engine) as uow:
            user, created = await uow.users.upsert_by_google_sub(
                GoogleIdentity(sub="sub-ana", email="ana@new.example"),
                uuid.uuid7(),
                T0 + timedelta(days=1),
            )
            await uow.commit()

        assert not created
        assert user.id == original.id
        assert user.email == "ana@new.example"
        assert user.created_at == T0

    async def test_concurrent_first_sign_ins_create_one_user(self, engine: AsyncEngine) -> None:
        results = await asyncio.gather(*(create_user(engine) for _ in range(5)))

        assert len({user.id for user in results}) == 1

    async def test_get_returns_none_for_an_unknown_id(self, uow: SqlAlchemyUnitOfWork) -> None:
        async with uow:
            assert await uow.users.get(uuid.uuid7()) is None

    async def test_delete(self, engine: AsyncEngine) -> None:
        user = await create_user(engine)

        async with new_uow(engine) as uow:
            assert await uow.users.delete(user.id)
            assert not await uow.users.delete(user.id)
            await uow.commit()

        async with new_uow(engine) as uow:
            assert await uow.users.get(user.id) is None


class TestRefreshTokens:
    async def test_add_and_find_by_hash(self, engine: AsyncEngine) -> None:
        user = await create_user(engine)
        token = refresh_token(user, await create_family(engine, user), "hash-1")

        async with new_uow(engine) as uow:
            await uow.refresh_tokens.add(token)
            await uow.commit()

        async with new_uow(engine) as uow:
            assert await uow.refresh_tokens.find_by_hash("hash-1") == token
            assert await uow.refresh_tokens.get_by_hash_for_update("hash-1") == token
            assert await uow.refresh_tokens.get(token.id) == token
            assert await uow.refresh_tokens.get_by_hash_for_update("other") is None
            assert await uow.refresh_tokens.find_by_hash("other") is None

    async def test_save_persists_a_rotation(self, engine: AsyncEngine) -> None:
        user = await create_user(engine)
        token = refresh_token(user, await create_family(engine, user), "hash-1")
        successor = refresh_token(user, token.family_id, "hash-2")
        rotated = token.rotated(successor.id, T0 + timedelta(minutes=1))

        async with new_uow(engine) as uow:
            await uow.refresh_tokens.add(token)
            await uow.refresh_tokens.add(successor)
            await uow.refresh_tokens.save(rotated)
            await uow.commit()

        async with new_uow(engine) as uow:
            assert await uow.refresh_tokens.get_by_hash_for_update("hash-1") == rotated

    async def test_revoke_family_keeps_earlier_revocations(self, engine: AsyncEngine) -> None:
        user = await create_user(engine)
        family, other_family = await create_family(engine, user), await create_family(engine, user)
        earlier = T0 + timedelta(minutes=1)
        later = T0 + timedelta(minutes=2)
        already_revoked = refresh_token(user, family, "a").rotated(uuid.uuid7(), earlier)

        async with new_uow(engine) as uow:
            await uow.refresh_tokens.add(already_revoked)
            await uow.refresh_tokens.add(refresh_token(user, family, "b"))
            await uow.refresh_tokens.add(refresh_token(user, other_family, "c"))
            await uow.refresh_tokens.revoke_family(family, later)
            await uow.commit()

        async with new_uow(engine) as uow:
            tokens = {
                h: await uow.refresh_tokens.get_by_hash_for_update(h) for h in ("a", "b", "c")
            }
        assert {h: t.revoked_at if t else "missing" for h, t in tokens.items()} == {
            "a": earlier,
            "b": later,
            "c": None,
        }


class TestRefreshFamilies:
    async def test_add_lock_and_revoke(self, engine: AsyncEngine) -> None:
        user = await create_user(engine)
        family_id = await create_family(engine, user)

        async with new_uow(engine) as uow:
            family = await uow.refresh_families.get_for_update(family_id)
            assert family == RefreshFamily(id=family_id, user_id=user.id, created_at=T0)
            await uow.refresh_families.revoke(family_id, T0 + timedelta(minutes=1))
            await uow.refresh_families.revoke(family_id, T0 + timedelta(minutes=2))
            await uow.commit()

        async with new_uow(engine) as uow:
            revoked = await uow.refresh_families.get_for_update(family_id)
            assert revoked is not None
            assert revoked.revoked_at == T0 + timedelta(minutes=1)
            assert await uow.refresh_families.get_for_update(uuid.uuid7()) is None

    async def test_a_family_dies_with_its_user(self, engine: AsyncEngine) -> None:
        user = await create_user(engine)
        family_id = await create_family(engine, user)

        async with new_uow(engine) as uow:
            await uow.users.delete(user.id)
            await uow.commit()

        async with new_uow(engine) as uow:
            assert await uow.refresh_families.get_for_update(family_id) is None


class TestUnitOfWork:
    async def test_rolls_back_without_commit(self, engine: AsyncEngine) -> None:
        async with new_uow(engine) as uow:
            user, _ = await uow.users.upsert_by_google_sub(ANA, uuid.uuid7(), T0)

        async with new_uow(engine) as uow:
            assert await uow.users.get(user.id) is None

    async def test_rolls_back_on_error(self, engine: AsyncEngine) -> None:
        new_id = uuid.uuid7()

        async def fail_after_insert() -> None:
            async with new_uow(engine) as uow:
                await uow.users.upsert_by_google_sub(ANA, new_id, T0)
                raise RuntimeError

        with pytest.raises(RuntimeError):
            await fail_after_insert()

        async with new_uow(engine) as uow:
            assert await uow.users.get(new_id) is None


async def test_concurrent_refreshes_both_succeed_and_leave_one_live_token(
    engine: AsyncEngine,
) -> None:
    """The family lock serializes them: the first rotates, the second is a retry within the grace
    window. Both callers get tokens, only the last one issued stays live, and the family lives."""
    user = await create_user(engine)
    sessions = SessionIssuer(access_tokens=FakeAccessTokens(), refresh_token_ttl=timedelta(days=1))
    family = RefreshFamily(id=uuid.uuid7(), user_id=user.id, created_at=T0)
    async with new_uow(engine) as uow:
        await uow.refresh_families.add(family)
        tokens, _ = await sessions.issue(uow, family=family, now=T0)
        await uow.commit()
    refresh = RefreshSession(
        sessions=sessions, unit_of_work=lambda: new_uow(engine), clock=FakeClock()
    )

    results = await asyncio.gather(
        refresh.execute(tokens.refresh_token),
        refresh.execute(tokens.refresh_token),
    )

    async with engine.connect() as connection:
        live = (
            (
                await connection.execute(
                    text("SELECT token_hash FROM refresh_tokens WHERE revoked_at IS NULL")
                )
            )
            .scalars()
            .all()
        )
        family_revoked_at = await connection.scalar(text("SELECT revoked_at FROM refresh_families"))
    issued = {hash_refresh_secret(r.refresh_token) for r in results}
    assert len(issued) == 2
    assert len(live) == 1
    assert live[0] in issued
    assert family_revoked_at is None
