from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Connection, inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

import english_learn_api.auth.infrastructure.tables
import english_learn_api.sync.infrastructure.tables  # noqa: F401 - registers tables
from english_learn_api.shared.database import metadata
from tests.integration.conftest import downgrade, upgrade

TABLES = {"users", "devices", "events", "refresh_families", "refresh_tokens"}


def table_names(connection: Connection) -> set[str]:
    return set(inspect(connection).get_table_names()) - {"alembic_version"}


async def test_head_creates_every_table(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        assert await connection.run_sync(table_names) == TABLES


async def test_migrations_match_the_sqlalchemy_tables(engine: AsyncEngine) -> None:
    def diff(connection: Connection) -> list[object]:
        return list(compare_metadata(MigrationContext.configure(connection), metadata))

    async with engine.connect() as connection:
        assert await connection.run_sync(diff) == []


async def test_downgrade_to_base_and_upgrade_again(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        await connection.run_sync(downgrade, "base")
        assert await connection.run_sync(table_names) == set()

        await connection.run_sync(upgrade)
        assert await connection.run_sync(table_names) == TABLES


async def test_deleting_a_user_cascades_to_everything_they_own(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text(
                """
                INSERT INTO users (id, google_sub, email)
                VALUES ('00000000-0000-7000-8000-000000000001', 'sub-1', 'a@example.com');
                """
            )
        )
        await connection.execute(
            text(
                """
                INSERT INTO devices (id, user_id)
                VALUES ('00000000-0000-7000-8000-0000000000d1',
                        '00000000-0000-7000-8000-000000000001');
                """
            )
        )
        await connection.execute(
            text(
                """
                INSERT INTO events (id, user_id, device_id, type, payload, local_date, occurred_at)
                VALUES ('00000000-0000-7000-8000-0000000000e1',
                        '00000000-0000-7000-8000-000000000001',
                        '00000000-0000-7000-8000-0000000000d1',
                        'item_reviewed', '{"v": 1}', '2026-10-30', now());
                """
            )
        )
        await connection.execute(
            text(
                """
                INSERT INTO refresh_families (id, user_id)
                VALUES ('00000000-0000-7000-8000-0000000000f0',
                        '00000000-0000-7000-8000-000000000001');
                """
            )
        )
        await connection.execute(
            text(
                """
                INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at)
                VALUES ('00000000-0000-7000-8000-0000000000f1',
                        '00000000-0000-7000-8000-000000000001',
                        '00000000-0000-7000-8000-0000000000f0', 'hash', now());
                """
            )
        )

        await connection.execute(text("DELETE FROM users"))

        for table in ("devices", "events", "refresh_families", "refresh_tokens"):
            count = await connection.scalar(text(f"SELECT count(*) FROM {table}"))  # noqa: S608
            assert count == 0, table


async def test_refresh_families_are_backfilled_from_existing_tokens(engine: AsyncEngine) -> None:
    """0002 creates one family per existing `family_id`; it is revoked only if every token is."""
    async with engine.begin() as connection:
        await connection.run_sync(downgrade, "0001")
        await connection.execute(
            text(
                """
                INSERT INTO users (id, google_sub, email)
                VALUES ('00000000-0000-7000-8000-000000000001', 'sub-1', 'a@example.com');
                """
            )
        )
        await connection.execute(
            text(
                """
                INSERT INTO refresh_tokens
                    (id, user_id, family_id, token_hash, expires_at, revoked_at, created_at)
                VALUES
                    -- live family: rotated A, then live B
                    ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-000000000001',
                     '00000000-0000-7000-8000-0000000000a0', 'a', now(),
                     '2026-10-02T00:00Z', '2026-10-01T00:00Z'),
                    ('00000000-0000-7000-8000-00000000000b', '00000000-0000-7000-8000-000000000001',
                     '00000000-0000-7000-8000-0000000000a0', 'b', now(), NULL, '2026-10-02T00:00Z'),
                    -- logged-out family: every token revoked
                    ('00000000-0000-7000-8000-00000000000c', '00000000-0000-7000-8000-000000000001',
                     '00000000-0000-7000-8000-0000000000c0', 'c', now(),
                     '2026-10-05T00:00Z', '2026-10-03T00:00Z');
                """
            )
        )

        await connection.run_sync(upgrade)

        rows = (
            await connection.execute(
                text("SELECT id::text, created_at, revoked_at FROM refresh_families ORDER BY id")
            )
        ).all()
    assert [(r[0][-2:], r[1].isoformat(), r[2] and r[2].isoformat()) for r in rows] == [
        ("a0", "2026-10-01T00:00:00+00:00", None),
        ("c0", "2026-10-03T00:00:00+00:00", "2026-10-05T00:00:00+00:00"),
    ]
