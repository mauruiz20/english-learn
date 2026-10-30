"""`Authorization: Bearer <access token>` → the caller's user id, as a FastAPI dependency."""

from collections.abc import Awaitable, Callable
from typing import Annotated
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from english_learn_api.auth.application.ports import AccessTokens
from english_learn_api.auth.domain.errors import InvalidAccessTokenError
from english_learn_api.shared.clock import Clock
from english_learn_api.shared.errors import ApiError

type CurrentUserId = Callable[..., Awaitable[UUID]]

_bearer_scheme = HTTPBearer(auto_error=False, description="Access token from /v1/auth/*")


def build_current_user_id(access_tokens: AccessTokens, clock: Clock) -> CurrentUserId:
    async def current_user_id(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    ) -> UUID:
        if credentials is None:
            raise ApiError(401, "unauthorized", "Missing bearer token")
        try:
            return access_tokens.verify(credentials.credentials, clock.now())
        except InvalidAccessTokenError as error:
            raise ApiError(
                401,
                error.code,
                error.message,
                # RFC 6750 §3.1: tells the client to refresh rather than prompt for sign-in.
                headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
            ) from error

    return current_user_id
