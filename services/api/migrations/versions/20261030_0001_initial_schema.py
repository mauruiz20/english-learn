"""Initial schema: users, devices, the opaque event store and refresh tokens.

Revision ID: 0001
Revises:
Create Date: 2026-10-30 18:04:18.735571

"""

from collections.abc import Sequence
from datetime import datetime

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamp(
    name: str, *, nullable: bool = False, default_now: bool = False
) -> sa.Column[datetime]:
    return sa.Column(
        name,
        sa.DateTime(timezone=True),
        nullable=nullable,
        server_default=sa.func.now() if default_now else None,
    )


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("google_sub", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        _timestamp("created_at", default_now=True),
        _timestamp("deleted_at", nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("google_sub", name="uq_users_google_sub"),
    )

    op.create_table(
        "devices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        _timestamp("created_at", default_now=True),
        _timestamp("last_seen_at", nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_devices"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_devices_user_id_users", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_devices_user_id", "devices", ["user_id"])

    op.create_table(
        "events",
        sa.Column("seq", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        _timestamp("occurred_at"),
        _timestamp("received_at", default_now=True),
        sa.PrimaryKeyConstraint("seq", name="pk_events"),
        sa.UniqueConstraint("id", name="uq_events_id"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_events_user_id_users", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], name="fk_events_device_id_devices"),
    )
    op.create_index("ix_events_user_id_seq", "events", ["user_id", "seq"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        _timestamp("expires_at"),
        _timestamp("revoked_at", nullable=True),
        sa.Column("replaced_by", sa.Uuid(), nullable=True),
        _timestamp("created_at", default_now=True),
        sa.PrimaryKeyConstraint("id", name="pk_refresh_tokens"),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_refresh_tokens_user_id_users", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"])
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_table("refresh_tokens")
    op.drop_table("events")
    op.drop_table("devices")
    op.drop_table("users")
