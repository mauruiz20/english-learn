"""SQLAlchemy Core tables for accounts and refresh tokens (mirrors the Alembic migrations)."""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Table, Text, Uuid, func

from english_learn_api.shared.database import metadata

users = Table(
    "users",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("google_sub", Text, nullable=False, unique=True),
    Column("email", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("deleted_at", DateTime(timezone=True), nullable=True),
)

refresh_tokens = Table(
    "refresh_tokens",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("family_id", Uuid, nullable=False),
    Column("token_hash", Text, nullable=False, unique=True),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("revoked_at", DateTime(timezone=True), nullable=True),
    Column("replaced_by", Uuid, nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Index(None, "family_id"),
    Index(None, "user_id"),
)
