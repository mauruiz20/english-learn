"""Ports the auth use cases depend on. Adapters live in `auth.infrastructure`; fakes in tests."""

from datetime import datetime
from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from english_learn_api.auth.domain.models import AccessToken, GoogleIdentity, RefreshToken, User


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

    async def delete(self, user_id: UUID) -> bool:
        """Hard-delete the user; the database cascades to devices, events and tokens."""
        ...


class RefreshTokenRepository(Protocol):
    async def add(self, token: RefreshToken) -> None: ...

    async def get_by_hash_for_update(self, token_hash: str) -> RefreshToken | None:
        """Fetch and lock the row, so two concurrent refreshes cannot both rotate it."""
        ...

    async def save(self, token: RefreshToken) -> None: ...

    async def revoke_family(self, family_id: UUID, now: datetime) -> None: ...


class UnitOfWork(Protocol):
    """One database transaction. Leaving the block without `commit()` rolls back."""

    @property
    def users(self) -> UserRepository: ...

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
