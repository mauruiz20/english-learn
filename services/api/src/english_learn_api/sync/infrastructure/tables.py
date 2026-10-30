"""Tables for progress sync: devices and the opaque, append-only event store.

The server never folds events (the fold lives in the client domain package); it stores the
envelope fields it needs to page and filter, and keeps the payload as JSON. Used from stage 5.
"""

from sqlalchemy import (
    BigInteger,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Table,
    Text,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB

from english_learn_api.shared.database import metadata

devices = Table(
    "devices",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("last_seen_at", DateTime(timezone=True), nullable=True),
    Index(None, "user_id"),
)

events = Table(
    "events",
    metadata,
    # BIGSERIAL, server-assigned and increasing: clients page with "events after seq N".
    Column("seq", BigInteger, primary_key=True, autoincrement=True),
    Column("id", Uuid, nullable=False, unique=True),
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("device_id", Uuid, ForeignKey("devices.id"), nullable=False),
    Column("type", Text, nullable=False),
    Column("payload", JSONB, nullable=False),
    Column("local_date", Date, nullable=False),
    Column("occurred_at", DateTime(timezone=True), nullable=False),
    Column("received_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Index(None, "user_id", "seq"),
)
