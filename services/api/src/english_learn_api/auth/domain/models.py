"""Accounts and session tokens. Plain, immutable values: no framework or database types."""

from dataclasses import dataclass, replace
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, slots=True)
class GoogleIdentity:
    """What a verified Google ID token proves: a stable subject and a verified email."""

    sub: str
    email: str


@dataclass(frozen=True, slots=True)
class User:
    id: UUID
    google_sub: str
    email: str
    created_at: datetime


@dataclass(frozen=True, slots=True)
class AccessToken:
    value: str
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class RefreshToken:
    """A stored refresh token. Only the SHA-256 hash of the secret is ever persisted.

    Tokens rotate on every use; all tokens descending from one sign-in share a `family_id`.
    """

    id: UUID
    user_id: UUID
    family_id: UUID
    token_hash: str
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None = None
    replaced_by: UUID | None = None

    @property
    def was_rotated(self) -> bool:
        return self.replaced_by is not None

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    def is_expired(self, now: datetime) -> bool:
        return now >= self.expires_at

    def rotated(self, replaced_by: UUID, now: datetime) -> RefreshToken:
        return replace(self, revoked_at=now, replaced_by=replaced_by)


@dataclass(frozen=True, slots=True)
class TokenPair:
    """What a client receives after signing in or refreshing. `refresh_token` is the secret."""

    access_token: AccessToken
    refresh_token: str
    refresh_token_expires_at: datetime


@dataclass(frozen=True, slots=True)
class SignedIn:
    user: User
    tokens: TokenPair
    is_new_user: bool
