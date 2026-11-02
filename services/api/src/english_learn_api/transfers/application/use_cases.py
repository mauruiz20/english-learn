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
from english_learn_api.transfers.domain.errors import (
    CorruptTransferError,
    TransferCapacityError,
    TransferNotFoundError,
)
from english_learn_api.transfers.domain.limits import (
    MAX_LIVE_TRANSFER_BYTES,
    MAX_LIVE_TRANSFERS,
    PURGE_BATCH,
    TRANSFER_TTL,
)
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
        max_live: int = MAX_LIVE_TRANSFERS,
        max_live_bytes: int = MAX_LIVE_TRANSFER_BYTES,
        new_token: Callable[[], str] = new_transfer_token,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._clock = clock
        self._purge_batch = purge_batch
        self._max_live = max_live
        self._max_live_bytes = max_live_bytes
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
            usage = await uow.transfers.live_usage(now)
            full = usage.count >= self._max_live or usage.payload_bytes >= self._max_live_bytes
            if not full:
                await uow.transfers.add(transfer)
            await uow.commit()  # the purge stands either way
        if full:
            # Concurrent creates may each pass the check: the overshoot is bounded by the
            # concurrency cap (two at a time), a few MiB at most.
            logger.warning("transfer capacity reached", extra={"live": usage.count})
            msg = "Too many transfers are waiting to be claimed; try again later"
            raise TransferCapacityError(msg)
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
            try:
                events = await uow.transfers.claim(hash_transfer_token(token), now)
            except CorruptTransferError:
                await uow.commit()  # consumed all the same: a retry would only fail again
                logger.error("transfer corrupt")
                raise
            # The just-claimed row is stale too, so it usually goes in this same transaction.
            purged = await uow.transfers.purge(now, self._purge_batch)
            await uow.commit()
        if events is None:
            logger.info("transfer not found", extra={"purged": purged})
            msg = "This transfer does not exist, expired or was already used"
            raise TransferNotFoundError(msg)
        logger.info("transfer claimed", extra={"events": len(events), "purged": purged})
        return events


class PurgeStaleTransfers:
    """Deletes one bounded batch of claimed or expired transfers; the app runs it periodically, so
    stale payloads go even when nobody creates or claims a transfer."""

    def __init__(
        self,
        *,
        unit_of_work: TransferUnitOfWorkFactory,
        clock: Clock,
        batch: int = PURGE_BATCH,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._clock = clock
        self._batch = batch

    async def execute(self) -> int:
        async with self._unit_of_work() as uow:
            purged = await uow.transfers.purge(self._clock.now(), self._batch)
            await uow.commit()
        if purged:
            logger.info("stale transfers purged", extra={"purged": purged})
        return purged
