"""Request and response bodies. JSON uses camelCase, like the TypeScript client."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from english_learn_api.auth.domain.models import SignedIn, TokenPair, User


class CamelRequest(BaseModel):
    """Accepts only the camelCase names (explicit aliases) and rejects unknown fields."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class CamelResponse(BaseModel):
    """Built from Python names, serialized with camelCase aliases."""

    model_config = ConfigDict(
        alias_generator=to_camel, validate_by_name=True, serialize_by_alias=True, frozen=True
    )


class GoogleSignInRequest(CamelRequest):
    id_token: Annotated[str, Field(alias="idToken", min_length=1, max_length=4096)]


class RefreshTokenRequest(CamelRequest):
    refresh_token: Annotated[str, Field(alias="refreshToken", min_length=1, max_length=256)]


class UserResponse(CamelResponse):
    id: UUID
    email: str

    @classmethod
    def of(cls, user: User) -> UserResponse:
        return cls(id=user.id, email=user.email)


class TokensResponse(CamelResponse):
    """Body transport (default): the refresh token is in the JSON."""

    access_token: str
    access_token_expires_at: datetime
    refresh_token: str

    @classmethod
    def of(cls, tokens: TokenPair) -> TokensResponse:
        return cls(
            access_token=tokens.access_token.value,
            access_token_expires_at=tokens.access_token.expires_at,
            refresh_token=tokens.refresh_token,
        )


class CookieTokensResponse(CamelResponse):
    """Cookie transport: the refresh token is only in the HttpOnly `el_rt` cookie."""

    access_token: str
    access_token_expires_at: datetime

    @classmethod
    def of(cls, tokens: TokenPair) -> CookieTokensResponse:
        return cls(
            access_token=tokens.access_token.value,
            access_token_expires_at=tokens.access_token.expires_at,
        )


class SignInResponse(TokensResponse):
    """Body transport (default): the refresh token is in the JSON."""

    user: UserResponse

    @classmethod
    def of_sign_in(cls, signed_in: SignedIn) -> SignInResponse:
        tokens = signed_in.tokens
        return cls(
            access_token=tokens.access_token.value,
            access_token_expires_at=tokens.access_token.expires_at,
            refresh_token=tokens.refresh_token,
            user=UserResponse.of(signed_in.user),
        )


class CookieSignInResponse(CookieTokensResponse):
    """Cookie transport: the refresh token is only in the HttpOnly `el_rt` cookie."""

    user: UserResponse

    @classmethod
    def of_sign_in(cls, signed_in: SignedIn) -> CookieSignInResponse:
        tokens = signed_in.tokens
        return cls(
            access_token=tokens.access_token.value,
            access_token_expires_at=tokens.access_token.expires_at,
            user=UserResponse.of(signed_in.user),
        )
