"""Short-lived, single-use progress transfers between two web origins of the app.

`transfers` keeps the SHA-256 of a random token, the uploaded events (zlib-compressed JSON, dropped
when claimed), and when the transfer was created, expires and was claimed. Rows are anonymous
(no user) and purged by the API soon after they expire or are claimed.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-02 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "transfers",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("payload", sa.LargeBinary(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "(claimed_at IS NULL) = (payload IS NOT NULL)",
            name=op.f("ck_transfers_payload_until_claimed"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_transfers")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_transfers_token_hash")),
    )
    op.create_index(op.f("ix_transfers_expires_at"), "transfers", ["expires_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_transfers_expires_at"), table_name="transfers")
    op.drop_table("transfers")
