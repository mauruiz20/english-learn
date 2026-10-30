"""`Authorization: Bearer <access token>` → the caller's claims, as a FastAPI dependency.

Every protected route goes through it, so it also checks that the account still exists: a
deleted user's access token stays cryptographically valid until it expires, and must not reach
any handler (from stage 5 on, a sync write for a missing user would otherwise fail deep inside).
"""

from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from english_learn_api.auth.application.ports import AccessTokens
from english_learn_api.auth.application.use_cases import UnitOfWorkFactory
from english_learn_api.auth.domain.errors import AccountNotFoundError, InvalidAccessTokenError
from english_learn_api.auth.domain.models import AccessClaims
from english_learn_api.shared.clock import Clock
from english_learn_api.shared.errors import ApiError

type CurrentClaims = Callable[..., Awaitable[AccessClaims]]

_bearer_scheme = HTTPBearer(auto_error=False, description="Access token from /v1/auth/*")


def build_current_claims(
    access_tokens: AccessTokens, unit_of_work: UnitOfWorkFactory, clock: Clock
) -> CurrentClaims:
    async def current_claims(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    ) -> AccessClaims:
        if credentials is None:
            raise ApiError(401, "unauthorized", "Missing bearer token")
        try:
            claims = access_tokens.verify(credentials.credentials, clock.now())
        except InvalidAccessTokenError as error:
            raise ApiError(
                401,
                error.code,
                error.message,
                # RFC 6750 §3.1: tells the client to refresh rather than prompt for sign-in.
                headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
            ) from error
        async with unit_of_work() as uow:
            if await uow.users.get(claims.user_id) is None:
                msg = "Account no longer exists"
                raise AccountNotFoundError(msg)
        return claims

    return current_claims
