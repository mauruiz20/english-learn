"""Access tokens as HS256 JWTs, with a `kid` header for key rotation.

Tokens are signed with the active key and verified with whichever listed key their `kid` names,
so a new key can be introduced while tokens signed with the previous one expire. Time checks use
the injected `now` instead of PyJWT's wall clock, so they are testable and use the same clock as
the rest of the app.
"""

from collections.abc import Mapping
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
    def __init__(self, *, keys: Mapping[str, str], active_kid: str, ttl: timedelta) -> None:
        if active_kid not in keys:
            msg = "the active key id must be one of the keys"
            raise ValueError(msg)
        self._keys = dict(keys)
        self._active_kid = active_kid
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
            value=jwt.encode(
                claims,
                self._keys[self._active_kid],
                algorithm=ALGORITHM,
                headers={"kid": self._active_kid},
            ),
            expires_at=expires_at,
        )

    def verify(self, token: str, now: datetime) -> UUID:
        try:
            kid = jwt.get_unverified_header(token).get("kid")
            secret = self._keys.get(kid) if isinstance(kid, str) else None
            if secret is None:
                raise _invalid()
            claims = jwt.decode(
                token,
                secret,
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
