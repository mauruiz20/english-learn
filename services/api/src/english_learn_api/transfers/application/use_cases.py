"""One-time progress transfers between two web origins of the app.

The old site uploads its whole event log and gets a token; it sends the learner to the new site
with the token in the URL fragment, and the new site claims the events exactly once. Nothing
links a transfer to an account, and the server never reads the events.
"""

import logging
from collections.abc import Callable, Sequence

from english_learn_api.shared.clock import Clock
from english_learn_api.sync.domain.models import NewEvent
from english_learn_api.transfers.application.ports import TransferUnitOfWorkFactory
from english_learn_api.transfers.domain.errors import TransferNotFoundError
from english_learn_api.transfers.domain.limits import PURGE_BATCH, TRANSFER_TTL
from english_learn_api.transfers.domain.models import (
    IssuedTransfer,
    NewTransfer,
    hash_transfer_token,
    new_transfer_token,
)

logger = logging.getLogger(__name__)


class CreateTransfer:
    def __init__(
        self,
        *,
        unit_of_work: TransferUnitOfWorkFactory,
        clock: Clock,
        purge_batch: int = PURGE_BATCH,
        new_token: Callable[[], str] = new_transfer_token,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._clock = clock
        self._purge_batch = purge_batch
        self._new_token = new_token

    async def execute(self, events: Sequence[NewEvent]) -> IssuedTransfer:
        now = self._clock.now()
        token = self._new_token()
        transfer = NewTransfer(
            token_hash=hash_transfer_token(token),
            events=list(events),
            created_at=now,
            expires_at=now + TRANSFER_TTL,
        )
        async with self._unit_of_work() as uow:
            purged = await uow.transfers.purge(now, self._purge_batch)
            await uow.transfers.add(transfer)
            await uow.commit()
        logger.info("transfer created", extra={"events": len(events), "purged": purged})
        return IssuedTransfer(token=token, expires_at=transfer.expires_at)


class ClaimTransfer:
    def __init__(
        self,
        *,
        unit_of_work: TransferUnitOfWorkFactory,
        clock: Clock,
        purge_batch: int = PURGE_BATCH,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._clock = clock
        self._purge_batch = purge_batch

    async def execute(self, token: str) -> list[NewEvent]:
        now = self._clock.now()
        async with self._unit_of_work() as uow:
            events = await uow.transfers.claim(hash_transfer_token(token), now)
            # The just-claimed row is stale too, so it usually goes in this same transaction.
            purged = await uow.transfers.purge(now, self._purge_batch)
            await uow.commit()
        if events is None:
            logger.info("transfer not found", extra={"purged": purged})
            msg = "This transfer does not exist, expired or was already used"
            raise TransferNotFoundError(msg)
        logger.info("transfer claimed", extra={"events": len(events), "purged": purged})
        return events
