"""A progress transfer: the old site's events, kept briefly for the new site to claim once.

Anonymous: the bearer of the token is the owner. Only the token's SHA-256 is stored; with 256
random bits in the token, a leaked hash cannot be turned back into a usable one.
"""

import hashlib
import secrets
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from english_learn_api.sync.domain.models import NewEvent

TOKEN_BYTES = 32


def new_transfer_token() -> str:
    """32 random bytes, base64url without padding (43 characters)."""
    return secrets.token_urlsafe(TOKEN_BYTES)


def hash_transfer_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass(frozen=True, slots=True)
class NewTransfer:
    token_hash: str
    events: Sequence[NewEvent]
    created_at: datetime
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class IssuedTransfer:
    """What the creator gets back: the token (never stored) and when it stops working."""

    token: str
    expires_at: datetime
