from dataclasses import replace
from datetime import timedelta

import pytest

from english_learn_api.auth.application.use_cases import (
    Logout,
    RefreshSession,
    SessionIssuer,
    SignInWithGoogle,
)
from english_learn_api.auth.domain.errors import (
    GoogleEmailNotVerifiedError,
    InvalidGoogleTokenError,
    InvalidRefreshTokenError,
    RefreshTokenReuseError,
)
from english_learn_api.auth.domain.models import RefreshToken
from english_learn_api.auth.domain.refresh_secrets import hash_refresh_secret
from tests.fakes import (
    T0,
    FakeAccessTokens,
    FakeClock,
    FakeGoogleVerifier,
    FakeUnitOfWork,
    InMemoryStore,
)

REFRESH_TTL = timedelta(days=30)


class Auth:
    """The three use cases wired to one in-memory store, like the app wires them to Postgres."""

    def __init__(self) -> None:
        self.store = InMemoryStore()
        self.clock = FakeClock()
        self.google = FakeGoogleVerifier()
        self.google.register("google-ana", sub="sub-ana", email="ana@example.com")
        sessions = SessionIssuer(access_tokens=FakeAccessTokens(), refresh_token_ttl=REFRESH_TTL)
        self.sign_in = SignInWithGoogle(
            verifier=self.google,
            sessions=sessions,
            unit_of_work=self.unit_of_work,
            clock=self.clock,
        )
        self.refresh = RefreshSession(
            sessions=sessions, unit_of_work=self.unit_of_work, clock=self.clock
        )
        self.logout = Logout(unit_of_work=self.unit_of_work, clock=self.clock)

    def unit_of_work(self) -> FakeUnitOfWork:
        return FakeUnitOfWork(self.store)


@pytest.fixture
def auth() -> Auth:
    return Auth()


class TestSignInWithGoogle:
    async def test_creates_the_user_and_issues_tokens(self, auth: Auth) -> None:
        signed_in = await auth.sign_in.execute("google-ana")

        assert signed_in.is_new_user
        assert signed_in.user.google_sub == "sub-ana"
        assert signed_in.user.email == "ana@example.com"
        assert auth.store.users == {signed_in.user.id: signed_in.user}
        assert signed_in.tokens.access_token.expires_at == T0 + timedelta(minutes=15)
        assert signed_in.tokens.refresh_token_expires_at == T0 + REFRESH_TTL

    async def test_stores_only_the_hash_of_the_refresh_token(self, auth: Auth) -> None:
        signed_in = await auth.sign_in.execute("google-ana")

        (stored,) = auth.store.refresh_tokens.values()
        secret = signed_in.tokens.refresh_token
        assert stored.token_hash == hash_refresh_secret(secret)
        assert secret not in stored.token_hash
        assert stored.user_id == signed_in.user.id
        assert stored.expires_at == T0 + REFRESH_TTL
        assert len(secret) >= 43  # 32 random bytes, base64url

    async def test_a_second_sign_in_reuses_the_user_in_a_new_family(self, auth: Auth) -> None:
        first = await auth.sign_in.execute("google-ana")
        second = await auth.sign_in.execute("google-ana")

        assert not second.is_new_user
        assert second.user.id == first.user.id
        assert len(auth.store.users) == 1
        families = {t.family_id for t in auth.store.refresh_tokens.values()}
        assert len(families) == 2
        assert set(auth.store.refresh_families) == families

    async def test_updates_the_email_when_google_reports_a_new_one(self, auth: Auth) -> None:
        first = await auth.sign_in.execute("google-ana")
        auth.google.register("google-ana-2", sub="sub-ana", email="ana@new.example")

        second = await auth.sign_in.execute("google-ana-2")

        assert second.user.id == first.user.id
        assert auth.store.users[first.user.id].email == "ana@new.example"

    async def test_rejects_an_invalid_google_token(self, auth: Auth) -> None:
        with pytest.raises(InvalidGoogleTokenError):
            await auth.sign_in.execute("forged")

        assert auth.store.users == {}

    async def test_rejects_an_unverified_email(self, auth: Auth) -> None:
        auth.google.unverified.add("google-unverified")

        with pytest.raises(GoogleEmailNotVerifiedError):
            await auth.sign_in.execute("google-unverified")

        assert auth.store.users == {}


class TestRefreshSession:
    async def test_rotates_the_refresh_token_within_its_family(self, auth: Auth) -> None:
        signed_in = await auth.sign_in.execute("google-ana")
        auth.clock.advance(timedelta(minutes=20))

        rotated = await auth.refresh.execute(signed_in.tokens.refresh_token)

        assert rotated.refresh_token != signed_in.tokens.refresh_token
        now = T0 + timedelta(minutes=20)
        assert rotated.access_token.expires_at == now + timedelta(minutes=15)
        assert rotated.refresh_token_expires_at == now + REFRESH_TTL
        old = self._stored(auth, signed_in.tokens.refresh_token)
        new = self._stored(auth, rotated.refresh_token)
        assert old.revoked_at == now
        assert old.replaced_by == new.id
        assert new.family_id == old.family_id
        assert new.revoked_at is None

    async def test_the_rotated_token_keeps_working(self, auth: Auth) -> None:
        signed_in = await auth.sign_in.execute("google-ana")

        second = await auth.refresh.execute(signed_in.tokens.refresh_token)
        third = await auth.refresh.execute(second.refresh_token)

        assert third.refresh_token not in {signed_in.tokens.refresh_token, second.refresh_token}

    async def test_reusing_a_rotated_token_revokes_the_whole_family(self, auth: Auth) -> None:
        signed_in = await auth.sign_in.execute("google-ana")
        stolen = signed_in.tokens.refresh_token
        legit = await auth.refresh.execute(stolen)

        with pytest.raises(RefreshTokenReuseError):
            await auth.refresh.execute(stolen)

        family = auth.store.family(self._stored(auth, stolen).family_id)
        assert all(token.revoked_at is not None for token in family)
        with pytest.raises(InvalidRefreshTokenError):
            await auth.refresh.execute(legit.refresh_token)

    async def test_reuse_does_not_touch_other_families(self, auth: Auth) -> None:
        phone = await auth.sign_in.execute("google-ana")
        laptop = await auth.sign_in.execute("google-ana")
        await auth.refresh.execute(phone.tokens.refresh_token)

        with pytest.raises(RefreshTokenReuseError):
            await auth.refresh.execute(phone.tokens.refresh_token)

        assert await auth.refresh.execute(laptop.tokens.refresh_token)

    async def test_rejects_an_unknown_token(self, auth: Auth) -> None:
        with pytest.raises(InvalidRefreshTokenError):
            await auth.refresh.execute("not-a-token")

    async def test_rejects_an_expired_token(self, auth: Auth) -> None:
        signed_in = await auth.sign_in.execute("google-ana")
        auth.clock.advance(REFRESH_TTL)

        with pytest.raises(InvalidRefreshTokenError):
            await auth.refresh.execute(signed_in.tokens.refresh_token)

    async def test_accepts_a_token_just_before_it_expires(self, auth: Auth) -> None:
        signed_in = await auth.sign_in.execute("google-ana")
        auth.clock.advance(REFRESH_TTL - timedelta(seconds=1))

        assert await auth.refresh.execute(signed_in.tokens.refresh_token)

    async def test_a_revoked_family_refuses_refresh_even_if_the_token_is_live(
        self, auth: Auth
    ) -> None:
        signed_in = await auth.sign_in.execute("google-ana")
        token = self._stored(auth, signed_in.tokens.refresh_token)
        family = auth.store.refresh_families[token.family_id]
        auth.store.refresh_families[family.id] = replace(family, revoked_at=T0)

        with pytest.raises(InvalidRefreshTokenError):
            await auth.refresh.execute(signed_in.tokens.refresh_token)

    async def test_reuse_marks_the_family_revoked(self, auth: Auth) -> None:
        signed_in = await auth.sign_in.execute("google-ana")
        await auth.refresh.execute(signed_in.tokens.refresh_token)
        auth.clock.advance(timedelta(minutes=5))

        with pytest.raises(RefreshTokenReuseError):
            await auth.refresh.execute(signed_in.tokens.refresh_token)

        (family,) = auth.store.refresh_families.values()
        assert family.revoked_at == T0 + timedelta(minutes=5)

    async def test_rejects_tokens_of_a_deleted_user(self, auth: Auth) -> None:
        signed_in = await auth.sign_in.execute("google-ana")
        auth.store.users.clear()
        auth.store.refresh_tokens.clear()  # ON DELETE CASCADE

        with pytest.raises(InvalidRefreshTokenError):
            await auth.refresh.execute(signed_in.tokens.refresh_token)

    @staticmethod
    def _stored(auth: Auth, secret: str) -> RefreshToken:
        token_hash = hash_refresh_secret(secret)
        return next(t for t in auth.store.refresh_tokens.values() if t.token_hash == token_hash)


class TestLogout:
    async def test_revokes_the_family(self, auth: Auth) -> None:
        signed_in = await auth.sign_in.execute("google-ana")
        rotated = await auth.refresh.execute(signed_in.tokens.refresh_token)

        await auth.logout.execute(rotated.refresh_token)

        assert all(t.revoked_at == T0 for t in auth.store.refresh_tokens.values())
        assert all(f.revoked_at == T0 for f in auth.store.refresh_families.values())
        with pytest.raises(InvalidRefreshTokenError):
            await auth.refresh.execute(rotated.refresh_token)

    async def test_an_unknown_token_is_a_no_op(self, auth: Auth) -> None:
        await auth.logout.execute("not-a-token")

        assert auth.store.refresh_tokens == {}

    async def test_logging_out_with_an_old_token_still_revokes(self, auth: Auth) -> None:
        signed_in = await auth.sign_in.execute("google-ana")
        rotated = await auth.refresh.execute(signed_in.tokens.refresh_token)

        await auth.logout.execute(signed_in.tokens.refresh_token)

        with pytest.raises(InvalidRefreshTokenError):
            await auth.refresh.execute(rotated.refresh_token)
