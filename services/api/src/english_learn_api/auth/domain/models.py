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
class AccessClaims:
    """What a valid access token proves.

    `issued_at` changes on every refresh; `authenticated_at` is when the user last signed in with
    Google (the start of the refresh family), which is what sensitive operations check.
    """

    user_id: UUID
    issued_at: datetime
    authenticated_at: datetime


@dataclass(frozen=True, slots=True)
class RefreshFamily:
    """One sign-in: every refresh token rotated from it belongs to this family.

    The family row is the lock that serializes refresh, logout and reuse revocation, and
    `revoked_at` is authoritative: once set, no token of the family is accepted.
    """

    id: UUID
    user_id: UUID
    created_at: datetime
    revoked_at: datetime | None = None

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None


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
        """Exchanged for `replaced_by`; `revoked_at` records the rotation time."""
        return replace(self, revoked_at=now, replaced_by=replaced_by)

    def rerouted(self, replaced_by: UUID) -> RefreshToken:
        """A retried rotation: point at the new successor, keep the original rotation time."""
        return replace(self, replaced_by=replaced_by)

    def superseded(self, now: datetime) -> RefreshToken:
        """An unused successor replaced by a retry: revoked, never rotated."""
        return replace(self, revoked_at=now)


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
