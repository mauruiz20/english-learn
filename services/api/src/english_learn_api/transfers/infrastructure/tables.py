"""The short-lived transfers table (mirrors Alembic migration 0004).

`payload` is the uploaded events as zlib-compressed JSON: the server never queries inside it.
It is dropped when the transfer is claimed, and the row is purged soon after.
"""

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    Index,
    LargeBinary,
    Table,
    Text,
    func,
)

from english_learn_api.shared.database import metadata

transfers = Table(
    "transfers",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("token_hash", Text, nullable=False, unique=True),  # SHA-256 hex of the token
    Column("payload", LargeBinary, nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("claimed_at", DateTime(timezone=True), nullable=True),
    Index(None, "expires_at"),
    # Unclaimed transfers hold their events; claimed ones never do.
    CheckConstraint("(claimed_at IS NULL) = (payload IS NOT NULL)", name="payload_until_claimed"),
)
