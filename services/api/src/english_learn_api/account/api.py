from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from english_learn_api.account.application import DeleteAccount, GetProfile
from english_learn_api.auth.api.bearer import CurrentUserId
from english_learn_api.auth.api.schemas import UserResponse


def build_account_router(
    *, current_user_id: CurrentUserId, get_profile: GetProfile, delete_account: DeleteAccount
) -> APIRouter:
    router = APIRouter(prefix="/v1", tags=["account"])
    UserId = Annotated[UUID, Depends(current_user_id)]  # noqa: N806

    @router.get("/me")
    async def me(user_id: UserId) -> UserResponse:
        return UserResponse.of(await get_profile.execute(user_id))

    @router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_my_account(user_id: UserId) -> Response:
        """Permanently delete the account and all synced progress."""
        await delete_account.execute(user_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
