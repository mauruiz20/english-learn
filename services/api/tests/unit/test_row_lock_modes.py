"""The row-lock modes the user-row locks compile to on PostgreSQL.

SQLAlchemy's `with_for_update` flags map to PostgreSQL lock modes non-obviously
(`key_share=True` alone is FOR NO KEY UPDATE; FOR KEY SHARE needs `read=True` too), so the SQL
each lock sends is checked here.
"""

import uuid
from typing import Any, cast

from sqlalchemy import create_mock_engine
from sqlalchemy.ext.asyncio import AsyncSession

from english_learn_api.auth.infrastructure.sqlalchemy_repositories import SqlAlchemyUserRepository
from english_learn_api.sync.infrastructure.sqlalchemy_repositories import SqlAlchemyEventLog


class _RecordingSession:
    """Keeps the statements it is asked to run and answers each with no rows."""

    def __init__(self) -> None:
        self.statements: list[Any] = []

    async def execute(self, statement: Any) -> _RecordingSession:
        self.statements.append(statement)
        return self

    def first(self) -> None:
        return None


# Compiles only; nothing is ever executed.
_POSTGRESQL = create_mock_engine("postgresql+asyncpg://", lambda *_: None).dialect


def _sql(statement: Any) -> str:
    return str(statement.compile(dialect=_POSTGRESQL))


async def test_locking_a_user_against_deletion_takes_for_key_share() -> None:
    session = _RecordingSession()
    await SqlAlchemyUserRepository(cast(AsyncSession, session)).lock_against_deletion(uuid.uuid7())

    [statement] = session.statements
    assert _sql(statement).endswith("FOR KEY SHARE")


async def test_locking_a_user_for_a_sync_append_takes_for_no_key_update() -> None:
    session = _RecordingSession()
    await SqlAlchemyEventLog(cast(AsyncSession, session)).lock_for_append(uuid.uuid7())

    [statement] = session.statements
    assert _sql(statement).endswith("FOR NO KEY UPDATE")
