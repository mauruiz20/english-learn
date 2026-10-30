"""In-memory fakes for the auth ports.

`InMemoryStore` plays the database; each `FakeUnitOfWork` works on a copy and writes it back only
on `commit()`, so tests observe real transaction semantics (rollback on error included).
"""

from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from types import TracebackType
from typing import Self
from uuid import UUID

from english_learn_api.auth.domain.errors import (
    GoogleEmailNotVerifiedError,
    InvalidAccessTokenError,
    InvalidGoogleTokenError,
)
from english_learn_api.auth.domain.models import (
    AccessToken,
    GoogleIdentity,
    RefreshFamily,
    RefreshToken,
    User,
)

T0 = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)


class FakeClock:
    def __init__(self, now: datetime = T0) -> None:
        self._now = now

    def now(self) -> datetime:
        return self._now

    def advance(self, delta: timedelta) -> None:
        self._now += delta


class FakeGoogleVerifier:
    """Accepts the ID tokens it was told about; `unverified` ones have an unverified email."""

    def __init__(self) -> None:
        self.identities: dict[str, GoogleIdentity] = {}
        self.unverified: set[str] = set()

    def register(self, id_token: str, sub: str, email: str) -> None:
        self.identities[id_token] = GoogleIdentity(sub=sub, email=email)

    async def verify(self, id_token: str) -> GoogleIdentity:
        if id_token in self.unverified:
            msg = "Google account email is not verified"
            raise GoogleEmailNotVerifiedError(msg)
        if id_token not in self.identities:
            msg = "Google ID token is invalid"
            raise InvalidGoogleTokenError(msg)
        return self.identities[id_token]


class FakeAccessTokens:
    def __init__(self, ttl: timedelta = timedelta(minutes=15)) -> None:
        self.ttl = ttl

    def issue(self, user_id: UUID, now: datetime) -> AccessToken:
        return AccessToken(value=f"access:{user_id}:{now.isoformat()}", expires_at=now + self.ttl)

    def verify(self, token: str, now: datetime) -> UUID:
        prefix, user_id, issued = token.split(":", 2)
        if prefix != "access" or now >= datetime.fromisoformat(issued) + self.ttl:
            msg = "Access token is invalid"
            raise InvalidAccessTokenError(msg)
        return UUID(user_id)


@dataclass
class InMemoryStore:
    users: dict[UUID, User] = field(default_factory=dict)
    refresh_families: dict[UUID, RefreshFamily] = field(default_factory=dict)
    refresh_tokens: dict[UUID, RefreshToken] = field(default_factory=dict)

    def copy(self) -> InMemoryStore:
        return InMemoryStore(
            dict(self.users), dict(self.refresh_families), dict(self.refresh_tokens)
        )

    def replace_with(self, other: InMemoryStore) -> None:
        self.users = dict(other.users)
        self.refresh_families = dict(other.refresh_families)
        self.refresh_tokens = dict(other.refresh_tokens)

    def family(self, family_id: UUID) -> list[RefreshToken]:
        return [t for t in self.refresh_tokens.values() if t.family_id == family_id]


class InMemoryUsers:
    def __init__(self, store: InMemoryStore) -> None:
        self._store = store

    async def upsert_by_google_sub(
        self, identity: GoogleIdentity, new_id: UUID, now: datetime
    ) -> tuple[User, bool]:
        for user in self._store.users.values():
            if user.google_sub == identity.sub:
                updated = replace(user, email=identity.email)
                self._store.users[user.id] = updated
                return updated, False
        user = User(id=new_id, google_sub=identity.sub, email=identity.email, created_at=now)
        self._store.users[new_id] = user
        return user, True

    async def get(self, user_id: UUID) -> User | None:
        return self._store.users.get(user_id)

    async def lock_against_deletion(self, user_id: UUID) -> bool:
        return user_id in self._store.users

    async def delete(self, user_id: UUID) -> bool:
        if self._store.users.pop(user_id, None) is None:
            return False
        # ON DELETE CASCADE
        for family in [f for f in self._store.refresh_families.values() if f.user_id == user_id]:
            del self._store.refresh_families[family.id]
        for token in [t for t in self._store.refresh_tokens.values() if t.user_id == user_id]:
            del self._store.refresh_tokens[token.id]
        return True


class InMemoryRefreshFamilies:
    def __init__(self, store: InMemoryStore) -> None:
        self._store = store

    async def add(self, family: RefreshFamily) -> None:
        self._store.refresh_families[family.id] = family

    async def get_for_update(self, family_id: UUID) -> RefreshFamily | None:
        return self._store.refresh_families.get(family_id)

    async def revoke(self, family_id: UUID, now: datetime) -> None:
        family = self._store.refresh_families.get(family_id)
        if family is not None and family.revoked_at is None:
            self._store.refresh_families[family_id] = replace(family, revoked_at=now)


class InMemoryRefreshTokens:
    def __init__(self, store: InMemoryStore) -> None:
        self._store = store

    async def add(self, token: RefreshToken) -> None:
        self._store.refresh_tokens[token.id] = token

    async def find_by_hash(self, token_hash: str) -> RefreshToken | None:
        return next(
            (t for t in self._store.refresh_tokens.values() if t.token_hash == token_hash), None
        )

    async def get_by_hash_for_update(self, token_hash: str) -> RefreshToken | None:
        return await self.find_by_hash(token_hash)

    async def get(self, token_id: UUID) -> RefreshToken | None:
        return self._store.refresh_tokens.get(token_id)

    async def save(self, token: RefreshToken) -> None:
        self._store.refresh_tokens[token.id] = token

    async def revoke_family(self, family_id: UUID, now: datetime) -> None:
        for token in self._store.family(family_id):
            if token.revoked_at is None:
                self._store.refresh_tokens[token.id] = replace(token, revoked_at=now)


class FakeUnitOfWork:
    def __init__(self, store: InMemoryStore) -> None:
        self._store = store
        self._working = store.copy()
        self.users = InMemoryUsers(self._working)
        self.refresh_families = InMemoryRefreshFamilies(self._working)
        self.refresh_tokens = InMemoryRefreshTokens(self._working)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        """Uncommitted changes stay in the discarded working copy."""

    async def commit(self) -> None:
        self._store.replace_with(self._working)
