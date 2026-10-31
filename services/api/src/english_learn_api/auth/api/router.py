from collections.abc import Awaitable, Callable, Collection
from typing import Annotated, Any

from fastapi import APIRouter, Cookie, Depends, Request, Response, status

from english_learn_api.auth.api.schemas import (
    CookieSignInResponse,
    CookieTokensResponse,
    GoogleSignInRequest,
    RefreshTokenRequest,
    SignInResponse,
    TokensResponse,
)
from english_learn_api.auth.api.token_transport import (
    REFRESH_COOKIE,
    RefreshCookies,
    RequestedWithHeader,
    TokenTransport,
    TokenTransportHeader,
    require_csrf_headers,
)
from english_learn_api.auth.application.use_cases import Logout, RefreshSession, SignInWithGoogle
from english_learn_api.auth.domain.errors import (
    AuthenticationError,
    GoogleBusyError,
    GoogleEmailNotVerifiedError,
    GoogleUnavailableError,
    InvalidRefreshTokenError,
)
from english_learn_api.auth.domain.models import TokenPair
from english_learn_api.shared.clock import Clock
from english_learn_api.shared.errors import ApiError, DomainError

STATUS_BY_ERROR: dict[type[DomainError], int] = {
    AuthenticationError: status.HTTP_401_UNAUTHORIZED,
    GoogleEmailNotVerifiedError: status.HTTP_403_FORBIDDEN,
    GoogleUnavailableError: status.HTTP_503_SERVICE_UNAVAILABLE,
    GoogleBusyError: status.HTTP_503_SERVICE_UNAVAILABLE,
}

type RateLimit = Callable[[Request], Awaitable[None]]

MISSING_REFRESH_COOKIE = "No refresh cookie; sign in again"
_COOKIE_DOC = (
    "Cookie mode: `Set-Cookie: el_rt=<refresh token>; HttpOnly; Secure; SameSite=Strict; "
    "Path=/v1/auth; Max-Age=<seconds until the token expires>`"
)
_SET_COOKIE: dict[int | str, dict[str, Any]] = {
    200: {"headers": {"Set-Cookie": {"description": _COOKIE_DOC, "schema": {"type": "string"}}}}
}
_CLEAR_COOKIE: dict[int | str, dict[str, Any]] = {
    204: {
        "headers": {
            "Set-Cookie": {
                "description": "Cookie mode: clears `el_rt` (`Max-Age=0`)",
                "schema": {"type": "string"},
            }
        }
    }
}

RefreshCookie = Annotated[
    str | None,
    Cookie(
        alias=REFRESH_COOKIE,
        description="Cookie mode: the refresh token (HttpOnly, set by sign-in and refresh).",
    ),
]


def build_auth_router(
    *,
    sign_in: SignInWithGoogle,
    refresh: RefreshSession,
    logout: Logout,
    sign_in_limit: RateLimit,
    refresh_limit: RateLimit,
    logout_limit: RateLimit,
    clock: Clock,
    cookies: RefreshCookies,
    allowed_origins: Collection[str],
) -> APIRouter:
    router = APIRouter(prefix="/v1/auth", tags=["auth"])

    def set_refresh_cookie(response: Response, tokens: TokenPair) -> None:
        cookies.set(
            response,
            tokens.refresh_token,
            expires_at=tokens.refresh_token_expires_at,
            now=clock.now(),
        )

    @router.post("/google", dependencies=[Depends(sign_in_limit)], responses=_SET_COOKIE)
    async def sign_in_with_google(
        body: GoogleSignInRequest,
        response: Response,
        transport: TokenTransportHeader = TokenTransport.BODY,
    ) -> SignInResponse | CookieSignInResponse:
        """Exchange a Google ID token for API tokens.

        `nonce` is checked against the token's `nonce` claim when sent; cookie mode (the web
        app's OpenID Connect redirect flow) requires it.
        """
        if transport is TokenTransport.COOKIE and body.nonce is None:
            raise ApiError(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "validation_error",
                "body.nonce: Field required with X-Token-Transport: cookie",
            )
        signed_in = await sign_in.execute(body.id_token, nonce=body.nonce)
        if transport is TokenTransport.BODY:
            return SignInResponse.of_sign_in(signed_in)
        set_refresh_cookie(response, signed_in.tokens)
        return CookieSignInResponse.of_sign_in(signed_in)

    @router.post("/refresh", dependencies=[Depends(refresh_limit)], responses=_SET_COOKIE)
    async def refresh_session(
        *,
        request: Request,
        response: Response,
        body: RefreshTokenRequest | None = None,
        transport: TokenTransportHeader = TokenTransport.BODY,
        requested_with: RequestedWithHeader = None,
        refresh_cookie: RefreshCookie = None,
    ) -> TokensResponse | CookieTokensResponse:
        """Rotate the refresh token. Each refresh token works once.

        Body mode reads `refreshToken` from the body. Cookie mode reads the `el_rt` cookie (the
        body is ignored), needs `X-Requested-With: english-learn` and an allowed `Origin`, and
        clears the cookie when the session cannot continue (401).
        """
        if transport is TokenTransport.BODY:
            return TokensResponse.of(await refresh.execute(_required(body)))
        require_csrf_headers(request, requested_with, allowed_origins)
        try:
            if not refresh_cookie:
                raise InvalidRefreshTokenError(MISSING_REFRESH_COOKIE)
            tokens = await refresh.execute(refresh_cookie)
        except AuthenticationError as error:
            # Invalid, reused (family revoked) or expired: this session is over.
            raise ApiError(
                status.HTTP_401_UNAUTHORIZED,
                error.code,
                error.message,
                headers=cookies.clearing_header(),
            ) from error
        set_refresh_cookie(response, tokens)
        return CookieTokensResponse.of(tokens)

    @router.post(
        "/logout",
        status_code=status.HTTP_204_NO_CONTENT,
        dependencies=[Depends(logout_limit)],
        responses=_CLEAR_COOKIE,
    )
    async def log_out(
        request: Request,
        body: RefreshTokenRequest | None = None,
        transport: TokenTransportHeader = TokenTransport.BODY,
        requested_with: RequestedWithHeader = None,
        refresh_cookie: RefreshCookie = None,
    ) -> Response:
        """Revoke the refresh token and every token rotated from the same sign-in.

        Cookie mode reads the `el_rt` cookie (same CSRF rules as refresh) and always clears it.
        """
        response = Response(status_code=status.HTTP_204_NO_CONTENT)
        if transport is TokenTransport.BODY:
            await logout.execute(_required(body))
            return response
        require_csrf_headers(request, requested_with, allowed_origins)
        if refresh_cookie:
            await logout.execute(refresh_cookie)
        cookies.clear(response)
        return response

    return router


def _required(body: RefreshTokenRequest | None) -> str:
    """Body mode keeps its original contract: `{ refreshToken }` is required."""
    if body is None:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "validation_error",
            "body.refreshToken: Field required",
        )
    return body.refresh_token
