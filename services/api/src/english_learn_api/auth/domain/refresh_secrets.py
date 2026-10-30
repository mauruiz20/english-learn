"""Opaque refresh-token secrets: 32 random bytes for the client, a SHA-256 hash for the database.

A fast hash is enough (unlike passwords): the input already has 256 bits of entropy, so a leaked
hash cannot be brute-forced back into a usable token.
"""

import hashlib
import secrets

SECRET_BYTES = 32


def new_refresh_secret() -> str:
    return secrets.token_urlsafe(SECRET_BYTES)


def hash_refresh_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()
