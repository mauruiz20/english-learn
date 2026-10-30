from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from english_learn_api.account.application import DeleteAccount, GetProfile
from english_learn_api.auth.api.bearer import CurrentClaims
from english_learn_api.auth.api.schemas import UserResponse
from english_learn_api.auth.domain.models import AccessClaims


def build_account_router(
    *, current_claims: CurrentClaims, get_profile: GetProfile, delete_account: DeleteAccount
) -> APIRouter:
    router = APIRouter(prefix="/v1", tags=["account"])
    Claims = Annotated[AccessClaims, Depends(current_claims)]  # noqa: N806

    @router.get("/me")
    async def me(claims: Claims) -> UserResponse:
        return UserResponse.of(await get_profile.execute(claims.user_id))

    @router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_my_account(claims: Claims) -> Response:
        """Permanently delete the account and all synced progress.

        Needs an access token from a Google sign-in less than 5 minutes old (401
        `reauthentication_required` otherwise): the client signs in again first.
        """
        await delete_account.execute(claims.user_id, authenticated_at=claims.authenticated_at)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
