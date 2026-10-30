from fastapi import APIRouter, Response, status

from english_learn_api.auth.api.schemas import (
    GoogleSignInRequest,
    RefreshTokenRequest,
    SignInResponse,
    TokensResponse,
)
from english_learn_api.auth.application.use_cases import Logout, RefreshSession, SignInWithGoogle
from english_learn_api.auth.domain.errors import (
    AuthenticationError,
    GoogleEmailNotVerifiedError,
    GoogleUnavailableError,
)
from english_learn_api.shared.errors import DomainError

STATUS_BY_ERROR: dict[type[DomainError], int] = {
    AuthenticationError: status.HTTP_401_UNAUTHORIZED,
    GoogleEmailNotVerifiedError: status.HTTP_403_FORBIDDEN,
    GoogleUnavailableError: status.HTTP_503_SERVICE_UNAVAILABLE,
}


def build_auth_router(
    *, sign_in: SignInWithGoogle, refresh: RefreshSession, logout: Logout
) -> APIRouter:
    router = APIRouter(prefix="/v1/auth", tags=["auth"])

    @router.post("/google")
    async def sign_in_with_google(body: GoogleSignInRequest) -> SignInResponse:
        """Exchange a Google ID token (from Google Identity Services) for API tokens."""
        return SignInResponse.of_sign_in(await sign_in.execute(body.id_token))

    @router.post("/refresh")
    async def refresh_session(body: RefreshTokenRequest) -> TokensResponse:
        """Rotate the refresh token. Each refresh token works once."""
        return TokensResponse.of(await refresh.execute(body.refresh_token))

    @router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
    async def log_out(body: RefreshTokenRequest) -> Response:
        """Revoke the refresh token and every token rotated from the same sign-in."""
        await logout.execute(body.refresh_token)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
