from typing import Annotated

from fastapi import APIRouter, Depends, status

from english_learn_api.auth.api.bearer import CurrentClaims
from english_learn_api.auth.domain.models import AccessClaims
from english_learn_api.shared.errors import DomainError
from english_learn_api.shared.rate_limit import TokenBucketLimiter, enforce
from english_learn_api.sync.api.schemas import SyncRequest, SyncResponse
from english_learn_api.sync.application.use_cases import SyncProgress
from english_learn_api.sync.domain.errors import DeviceConflictError

STATUS_BY_ERROR: dict[type[DomainError], int] = {
    DeviceConflictError: status.HTTP_409_CONFLICT,
}


def build_sync_router(
    *, current_claims: CurrentClaims, sync: SyncProgress, limiter: TokenBucketLimiter
) -> APIRouter:
    router = APIRouter(prefix="/v1", tags=["sync"])

    # A dependency, so the limit is taken before the body is parsed and validated.
    async def rate_limited_claims(
        claims: Annotated[AccessClaims, Depends(current_claims)],
    ) -> AccessClaims:
        enforce(limiter, f"user:{claims.user_id}")
        return claims

    @router.post(
        "/sync",
        responses={
            status.HTTP_409_CONFLICT: {"description": "`device_conflict`: use a new device id"},
        },
    )
    async def sync_progress(
        body: SyncRequest, claims: Annotated[AccessClaims, Depends(rate_limited_claims)]
    ) -> SyncResponse:
        """Upload this device's events and download the account's events after `cursor`.

        Uploads are idempotent by event id. Keep syncing with the returned `cursor` while
        `hasMore` is true. The returned events include the ones just uploaded.
        """
        return SyncResponse.of(await sync.execute(claims.user_id, body.to_upload()))

    return router
