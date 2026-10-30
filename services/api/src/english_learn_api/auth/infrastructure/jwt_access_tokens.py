"""Access tokens as HS256 JWTs.

Time checks use the injected `now` instead of PyJWT's wall clock, so they are testable and use the
same clock as the rest of the app.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt

from english_learn_api.auth.domain.errors import InvalidAccessTokenError
from english_learn_api.auth.domain.models import AccessToken

ALGORITHM = "HS256"
ISSUER = "english-learn-api"
AUDIENCE = "english-learn-app"
CLOCK_SKEW = timedelta(seconds=30)
_REQUIRED_CLAIMS = ["sub", "iat", "exp", "iss", "aud"]


class JwtAccessTokens:
    def __init__(self, *, secret: str, ttl: timedelta) -> None:
        self._secret = secret
        self._ttl = ttl

    def issue(self, user_id: UUID, now: datetime) -> AccessToken:
        issued_at = now.replace(microsecond=0)  # JWT times are whole seconds
        expires_at = issued_at + self._ttl
        claims = {
            "sub": str(user_id),
            "iat": int(issued_at.timestamp()),
            "exp": int(expires_at.timestamp()),
            "iss": ISSUER,
            "aud": AUDIENCE,
        }
        return AccessToken(
            value=jwt.encode(claims, self._secret, algorithm=ALGORITHM),
            expires_at=expires_at,
        )

    def verify(self, token: str, now: datetime) -> UUID:
        try:
            claims = jwt.decode(
                token,
                self._secret,
                algorithms=[ALGORITHM],
                audience=AUDIENCE,
                issuer=ISSUER,
                options={"require": _REQUIRED_CLAIMS, "verify_exp": False, "verify_iat": False},
            )
            issued_at = datetime.fromtimestamp(claims["iat"], UTC)
            expires_at = datetime.fromtimestamp(claims["exp"], UTC)
            user_id = UUID(claims["sub"])
        except (jwt.InvalidTokenError, ValueError, TypeError) as error:
            raise _invalid() from error

        if now >= expires_at or issued_at > now + CLOCK_SKEW:
            raise _invalid()
        return user_id


def _invalid() -> InvalidAccessTokenError:
    return InvalidAccessTokenError("Access token is invalid or expired")
