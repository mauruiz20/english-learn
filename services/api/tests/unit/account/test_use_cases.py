import uuid
from datetime import timedelta

import pytest

from english_learn_api.account.application import DeleteAccount, GetProfile
from english_learn_api.auth.domain.errors import (
    AccountNotFoundError,
    ReauthenticationRequiredError,
)
from english_learn_api.auth.domain.models import RefreshToken, User
from tests.fakes import T0, FakeClock, FakeUnitOfWork, InMemoryStore

ANA = User(id=uuid.uuid7(), google_sub="sub-ana", email="ana@example.com", created_at=T0)


@pytest.fixture
def store() -> InMemoryStore:
    store = InMemoryStore()
    store.users[ANA.id] = ANA
    token = RefreshToken(
        id=uuid.uuid7(),
        user_id=ANA.id,
        family_id=uuid.uuid7(),
        token_hash="hash",
        created_at=T0,
        expires_at=T0,
    )
    store.refresh_tokens[token.id] = token
    return store


async def test_get_profile_returns_the_user(store: InMemoryStore) -> None:
    profile = GetProfile(unit_of_work=lambda: FakeUnitOfWork(store))

    assert await profile.execute(ANA.id) == ANA


async def test_get_profile_of_a_missing_user_fails(store: InMemoryStore) -> None:
    profile = GetProfile(unit_of_work=lambda: FakeUnitOfWork(store))

    with pytest.raises(AccountNotFoundError):
        await profile.execute(uuid.uuid7())


WINDOW = timedelta(minutes=5)


def delete_account(store: InMemoryStore, clock: FakeClock) -> DeleteAccount:
    return DeleteAccount(
        unit_of_work=lambda: FakeUnitOfWork(store), clock=clock, reauthentication_window=WINDOW
    )


async def test_delete_account_removes_the_user_and_their_tokens(store: InMemoryStore) -> None:
    clock = FakeClock(T0 + WINDOW - timedelta(seconds=1))

    await delete_account(store, clock).execute(ANA.id, authenticated_at=T0)

    assert store.users == {}
    assert store.refresh_tokens == {}


async def test_deleting_requires_a_recent_sign_in(store: InMemoryStore) -> None:
    clock = FakeClock(T0 + WINDOW)

    with pytest.raises(ReauthenticationRequiredError):
        await delete_account(store, clock).execute(ANA.id, authenticated_at=T0)

    assert ANA.id in store.users


async def test_deleting_a_missing_account_fails(store: InMemoryStore) -> None:
    with pytest.raises(AccountNotFoundError):
        await delete_account(store, FakeClock()).execute(uuid.uuid7(), authenticated_at=T0)
