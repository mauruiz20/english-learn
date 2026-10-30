"""Ports the auth use cases depend on. Adapters live in `auth.infrastructure`; fakes in tests."""

from datetime import datetime
from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from english_learn_api.auth.domain.models import (
    AccessToken,
    GoogleIdentity,
    RefreshFamily,
    RefreshToken,
    User,
)


class GoogleTokenVerifier(Protocol):
    async def verify(self, id_token: str) -> GoogleIdentity:
        """Return the identity, or raise `InvalidGoogleTokenError` /
        `GoogleEmailNotVerifiedError`."""
        ...


class AccessTokens(Protocol):
    def issue(self, user_id: UUID, now: datetime) -> AccessToken: ...

    def verify(self, token: str, now: datetime) -> UUID:
        """Return the user id, or raise `InvalidAccessTokenError`."""
        ...


class UserRepository(Protocol):
    async def upsert_by_google_sub(
        self, identity: GoogleIdentity, new_id: UUID, now: datetime
    ) -> tuple[User, bool]:
        """Insert the user (with `new_id`), or update the email of the existing one.

        Returns the stored user and whether it was created. Atomic under concurrent sign-ins.
        """
        ...

    async def get(self, user_id: UUID) -> User | None: ...

    async def lock_against_deletion(self, user_id: UUID) -> bool:
        """Keep the user from being deleted until the transaction ends; False if already gone.

        Taken before any refresh-family lock, in the same order as a deletion's cascade, so a
        refresh racing with an account deletion waits instead of deadlocking.
        """
        ...

    async def delete(self, user_id: UUID) -> bool:
        """Hard-delete the user; the database cascades to devices, events and tokens."""
        ...


class RefreshFamilyRepository(Protocol):
    async def add(self, family: RefreshFamily) -> None: ...

    async def get_for_update(self, family_id: UUID) -> RefreshFamily | None:
        """Fetch and lock the family. Every change to a family's tokens happens under this lock."""
        ...

    async def revoke(self, family_id: UUID, now: datetime) -> None:
        """Set `revoked_at` (kept if already set)."""
        ...


class RefreshTokenRepository(Protocol):
    async def add(self, token: RefreshToken) -> None: ...

    async def find_by_hash(self, token_hash: str) -> RefreshToken | None:
        """Unlocked read, only to learn which user and family to lock."""
        ...

    async def get_by_hash_for_update(self, token_hash: str) -> RefreshToken | None:
        """Fetch and lock the row (after its family is locked)."""
        ...

    async def get(self, token_id: UUID) -> RefreshToken | None: ...

    async def save(self, token: RefreshToken) -> None: ...

    async def revoke_family(self, family_id: UUID, now: datetime) -> None:
        """Revoke every live token of the family (defense in depth next to the family flag)."""
        ...


class UnitOfWork(Protocol):
    """One database transaction. Leaving the block without `commit()` rolls back."""

    @property
    def users(self) -> UserRepository: ...

    @property
    def refresh_families(self) -> RefreshFamilyRepository: ...

    @property
    def refresh_tokens(self) -> RefreshTokenRepository: ...

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None: ...

    async def commit(self) -> None: ...
