from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Depends, Request, status

from english_learn_api.shared.errors import DomainError
from english_learn_api.transfers.api.schemas import (
    ClaimTransferRequest,
    ClaimTransferResponse,
    CreateTransferRequest,
    CreateTransferResponse,
)
from english_learn_api.transfers.application.use_cases import ClaimTransfer, CreateTransfer
from english_learn_api.transfers.domain.errors import TransferNotFoundError

STATUS_BY_ERROR: dict[type[DomainError], int] = {
    TransferNotFoundError: status.HTTP_404_NOT_FOUND,
}

CREATE_PATH = "/v1/transfers"
CLAIM_PATH = "/v1/transfers/claim"

type RateLimit = Callable[[Request], Awaitable[None]]


def build_transfers_router(
    *,
    create: CreateTransfer,
    claim: ClaimTransfer,
    create_limit: RateLimit,
    claim_limit: RateLimit,
) -> APIRouter:
    router = APIRouter(tags=["transfers"])

    # Limits are dependencies, so they are taken before the body is validated.
    @router.post(
        CREATE_PATH,
        status_code=status.HTTP_201_CREATED,
        dependencies=[Depends(create_limit)],
        responses={status.HTTP_413_CONTENT_TOO_LARGE: {"description": "Body over 2 MiB"}},
    )
    async def create_transfer(body: CreateTransferRequest) -> CreateTransferResponse:
        """Store a device's events for 15 minutes and return a single-use token.

        Anonymous and without credentials: the old web site calls it before sending the learner
        to the new one with the token in the URL fragment.
        """
        return CreateTransferResponse.of(await create.execute(body.to_events()))

    @router.post(
        CLAIM_PATH,
        dependencies=[Depends(claim_limit)],
        responses={
            status.HTTP_404_NOT_FOUND: {
                "description": "`transfer_not_found`: unknown, expired or already claimed"
            },
        },
    )
    async def claim_transfer(body: ClaimTransferRequest) -> ClaimTransferResponse:
        """Return a transfer's events, exactly once; the transfer is deleted."""
        return ClaimTransferResponse.of(await claim.execute(body.token))

    return router
