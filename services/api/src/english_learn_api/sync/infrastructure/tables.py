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
    ForeignKeyConstraint,
    Index,
    Table,
    Text,
    UniqueConstraint,
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
    # Target of the events' composite foreign key: a device together with its owner.
    UniqueConstraint("id", "user_id"),
)

events = Table(
    "events",
    metadata,
    # BIGSERIAL, server-assigned and increasing: clients page with "events after seq N".
    Column("seq", BigInteger, primary_key=True, autoincrement=True),
    Column("id", Uuid, nullable=False),  # client-generated: unique per user, not globally
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("device_id", Uuid, nullable=False),
    Column("type", Text, nullable=False),
    Column("payload", JSONB, nullable=False),
    Column("local_date", Date, nullable=False),
    Column("occurred_at", DateTime(timezone=True), nullable=False),
    Column("received_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Index(None, "user_id", "seq"),
    UniqueConstraint("user_id", "id"),
    # An event's device must belong to the event's user.
    ForeignKeyConstraint(
        ["device_id", "user_id"], ["devices.id", "devices.user_id"], ondelete="CASCADE"
    ),
)
