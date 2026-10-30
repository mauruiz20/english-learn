from typing import ClassVar

from english_learn_api.shared.errors import DomainError


class AuthenticationError(DomainError):
    """The caller could not be authenticated. The API answers 401 for every subclass."""

    code: ClassVar[str] = "unauthorized"


class InvalidGoogleTokenError(AuthenticationError):
    code: ClassVar[str] = "invalid_google_token"


class GoogleEmailNotVerifiedError(DomainError):
    code: ClassVar[str] = "google_email_not_verified"


class InvalidRefreshTokenError(AuthenticationError):
    """Unknown, revoked or expired. Deliberately one code: the client signs in again."""

    code: ClassVar[str] = "invalid_refresh_token"


class RefreshTokenReuseError(AuthenticationError):
    """An already-rotated token came back: likely stolen, so its whole family is revoked."""

    code: ClassVar[str] = "refresh_token_reused"


class InvalidAccessTokenError(AuthenticationError):
    code: ClassVar[str] = "invalid_token"
