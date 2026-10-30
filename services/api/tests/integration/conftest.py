"""A real PostgreSQL 18 per test session (testcontainers), migrated with Alembic.

Set `TEST_DATABASE_URL` to use an existing, disposable database instead of starting a container.
Every test starts with empty tables.
"""

import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, text
from sqlalchemy.ext.asyncio import AsyncEngine
from testcontainers.community.postgres import PostgresContainer

from english_learn_api.shared.database import create_engine

POSTGRES_IMAGE = "postgres:18-alpine"

# Ryuk (the container reaper) mounts the Docker socket *inside the Docker VM*. Docker Desktop's
# client socket (~/.docker/run/docker.sock) does not exist there; /var/run/docker.sock does, and it
# is also the Linux default. Override the variable for rootless Docker or Podman.
os.environ.setdefault("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE", "/var/run/docker.sock")
ALEMBIC_INI = Path(__file__).parents[2] / "alembic.ini"


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    for item in items:
        if Path(item.path).is_relative_to(Path(__file__).parent):
            item.add_marker(pytest.mark.integration)


def alembic_config(connection: Connection) -> Config:
    config = Config(ALEMBIC_INI)
    config.attributes["connection"] = connection
    config.attributes["configure_logger"] = False
    return config


def upgrade(connection: Connection, revision: str = "head") -> None:
    command.upgrade(alembic_config(connection), revision)


def downgrade(connection: Connection, revision: str) -> None:
    command.downgrade(alembic_config(connection), revision)


@pytest.fixture(scope="session")
def database_url() -> Iterator[str]:
    if url := os.environ.get("TEST_DATABASE_URL"):
        yield url
        return
    with PostgresContainer(POSTGRES_IMAGE, driver="asyncpg") as postgres:
        yield postgres.get_connection_url()


@pytest.fixture(scope="session")
async def engine(database_url: str) -> AsyncIterator[AsyncEngine]:
    engine = create_engine(database_url)
    async with engine.begin() as connection:
        await connection.run_sync(upgrade)
    yield engine
    await engine.dispose()


@pytest.fixture(autouse=True)
async def empty_tables(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "TRUNCATE users, devices, events, refresh_families, refresh_tokens "
                "RESTART IDENTITY CASCADE"
            )
        )
