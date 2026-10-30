"""Refresh families: one lockable row per sign-in, authoritative for revocation.

Existing tokens are grouped by their `family_id`. A family is created as revoked only when every
token in it is already revoked (logout or reuse revocation under the previous scheme).

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-30 21:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "refresh_families",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_refresh_families"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_refresh_families_user_id_users", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_refresh_families_user_id", "refresh_families", ["user_id"])

    op.execute(
        """
        INSERT INTO refresh_families (id, user_id, created_at, revoked_at)
        SELECT family_id,
               min(user_id::text)::uuid,
               min(created_at),
               CASE WHEN bool_and(revoked_at IS NOT NULL) THEN max(revoked_at) END
        FROM refresh_tokens
        GROUP BY family_id
        """
    )

    op.create_foreign_key(
        "fk_refresh_tokens_family_id_refresh_families",
        "refresh_tokens",
        "refresh_families",
        ["family_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_refresh_tokens_family_id_refresh_families", "refresh_tokens", type_="foreignkey"
    )
    op.drop_table("refresh_families")
