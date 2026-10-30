"""The signed-in user's own account: read the profile, delete everything."""

import logging
from datetime import datetime, timedelta
from uuid import UUID

from english_learn_api.auth.application.use_cases import UnitOfWorkFactory
from english_learn_api.auth.domain.errors import (
    AccountNotFoundError,
    ReauthenticationRequiredError,
)
from english_learn_api.auth.domain.models import User
from english_learn_api.shared.clock import Clock

logger = logging.getLogger(__name__)

DEFAULT_REAUTHENTICATION_WINDOW = timedelta(minutes=5)

__all__ = ["AccountNotFoundError", "DeleteAccount", "GetProfile"]


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
    """Hard delete: the database cascades to devices, events and refresh tokens.

    Irreversible, so it needs a recent Google sign-in (`authenticated_at`), not only a valid
    session: a stolen refresh token can mint fresh access tokens but cannot sign in again.
    """

    def __init__(
        self,
        *,
        unit_of_work: UnitOfWorkFactory,
        clock: Clock,
        reauthentication_window: timedelta = DEFAULT_REAUTHENTICATION_WINDOW,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._clock = clock
        self._window = reauthentication_window

    async def execute(self, user_id: UUID, *, authenticated_at: datetime) -> None:
        if self._clock.now() - authenticated_at >= self._window:
            msg = "Sign in with Google again to delete the account"
            raise ReauthenticationRequiredError(msg)
        async with self._unit_of_work() as uow:
            if not await uow.users.delete(user_id):
                raise _not_found()
            await uow.commit()
        logger.info("account deleted", extra={"user_id": str(user_id)})


def _not_found() -> AccountNotFoundError:
    return AccountNotFoundError("Account no longer exists")
