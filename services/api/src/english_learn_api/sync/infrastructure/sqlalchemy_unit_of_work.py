from types import TracebackType
from typing import Self

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from english_learn_api.sync.infrastructure.sqlalchemy_repositories import (
    SqlAlchemyDeviceRepository,
    SqlAlchemyEventLog,
)


class SqlAlchemySyncUnitOfWork:
    """One `AsyncSession` and one transaction per `async with` block; rolls back unless committed.

    Create a new instance per operation (the app passes a factory to the use case).
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def __aenter__(self) -> Self:
        self._session = self._session_factory()
        self.devices = SqlAlchemyDeviceRepository(self._session)
        self.events = SqlAlchemyEventLog(self._session)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        try:
            await self._session.rollback()  # a no-op after commit()
        finally:
            await self._session.close()

    async def commit(self) -> None:
        await self._session.commit()
