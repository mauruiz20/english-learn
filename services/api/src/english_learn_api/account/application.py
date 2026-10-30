"""The signed-in user's own account: read the profile, delete everything."""

import logging
from typing import ClassVar
from uuid import UUID

from english_learn_api.auth.application.use_cases import UnitOfWorkFactory
from english_learn_api.auth.domain.errors import AuthenticationError
from english_learn_api.auth.domain.models import User

logger = logging.getLogger(__name__)


class AccountNotFoundError(AuthenticationError):
    """A valid access token whose account was deleted in the meantime."""

    code: ClassVar[str] = "account_not_found"


class GetProfile:
    def __init__(self, *, unit_of_work: UnitOfWorkFactory) -> None:
        self._unit_of_work = unit_of_work

    async def execute(self, user_id: UUID) -> User:
        async with self._unit_of_work() as uow:
            user = await uow.users.get(user_id)
        if user is None:
            raise _not_found()
        return user


class DeleteAccount:
    """Hard delete: the database cascades to devices, events and refresh tokens."""

    def __init__(self, *, unit_of_work: UnitOfWorkFactory) -> None:
        self._unit_of_work = unit_of_work

    async def execute(self, user_id: UUID) -> None:
        async with self._unit_of_work() as uow:
            if not await uow.users.delete(user_id):
                raise _not_found()
            await uow.commit()
        logger.info("account deleted", extra={"user_id": str(user_id)})


def _not_found() -> AccountNotFoundError:
    return AccountNotFoundError("Account no longer exists")
