"""Verifies Google ID tokens with google-auth (`id_token.verify_oauth2_token`).

google-auth checks the RS256 signature against Google's certificates, `exp`/`iat`, the audience
(our OAuth client id) and the issuer (`accounts.google.com`); we also require a verified email.
It is synchronous, so it runs in a worker thread, and its certificate download is cached.
"""

import asyncio
import re
import threading
import time
from collections.abc import Callable
from typing import Any

from google.auth import exceptions, transport
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from english_learn_api.auth.domain.errors import (
    GoogleEmailNotVerifiedError,
    GoogleUnavailableError,
    InvalidGoogleTokenError,
)
from english_learn_api.auth.domain.models import GoogleIdentity

CLOCK_SKEW_SECONDS = 10
DEFAULT_CACHE_SECONDS = 3600
REQUEST_TIMEOUT_SECONDS = 5
_MAX_AGE = re.compile(r"max-age=(\d+)")
# A compact JWS: three base64url segments. Anything else is rejected before google-auth parses it.
_COMPACT_JWS = re.compile(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")


class CachingRequest(transport.Request):
    """Wraps a google-auth transport and caches successful GETs for their `max-age`.

    Google rotates its signing keys roughly daily and publishes `Cache-Control: max-age`, so
    without this every sign-in would download the certificates again.
    """

    def __init__(
        self,
        inner: transport.Request,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._inner = inner
        self._monotonic = monotonic
        self._cache: dict[str, tuple[float, transport.Response]] = {}
        self._lock = threading.Lock()

    def __call__(
        self,
        url: str,
        method: str = "GET",
        body: Any = None,
        headers: Any = None,
        timeout: Any = None,
        **kwargs: Any,
    ) -> transport.Response:
        if method != "GET":
            return self._inner(url, method, body, headers, timeout, **kwargs)

        with self._lock:
            cached = self._cache.get(url)
            if cached is not None and cached[0] > self._monotonic():
                return cached[1]

            response = self._inner(
                url, method, body, headers, timeout or REQUEST_TIMEOUT_SECONDS, **kwargs
            )
            if response.status == 200:  # noqa: PLR2004
                self._cache[url] = (self._monotonic() + _max_age(response), response)
            return response


def _max_age(response: transport.Response) -> int:
    for name, value in response.headers.items():
        if name.lower() == "cache-control" and (match := _MAX_AGE.search(value)):
            return int(match.group(1))
    return DEFAULT_CACHE_SECONDS


class GoogleIdTokenVerifier:
    def __init__(self, *, client_id: str, request: transport.Request | None = None) -> None:
        self._client_id = client_id
        self._request = CachingRequest(request or google_requests.Request())

    async def verify(self, id_token: str) -> GoogleIdentity:
        return await asyncio.to_thread(self._verify, id_token)

    def _verify(self, id_token: str) -> GoogleIdentity:
        if not _COMPACT_JWS.fullmatch(id_token):
            raise _invalid()
        try:
            claims = google_id_token.verify_oauth2_token(
                id_token,
                self._request,
                audience=self._client_id,
                clock_skew_in_seconds=CLOCK_SKEW_SECONDS,
            )
        except exceptions.TransportError as error:
            msg = "Google sign-in is temporarily unavailable"
            raise GoogleUnavailableError(msg) from error
        except (
            ValueError,
            TypeError,
            KeyError,
            AttributeError,
            exceptions.GoogleAuthError,
        ) as error:
            # ValueError: bad signature, expired, wrong audience, malformed token.
            # GoogleAuthError: wrong issuer. TypeError/KeyError/AttributeError: a header or
            # payload of the wrong shape (`{"alg": ["RS256"]}`) that google-auth does not check.
            raise _invalid() from error

        sub, email = claims.get("sub"), claims.get("email")
        if not isinstance(sub, str) or not sub or not isinstance(email, str) or not email:
            raise _invalid()
        if claims.get("email_verified") is not True:
            msg = "Google account email is not verified"
            raise GoogleEmailNotVerifiedError(msg)
        return GoogleIdentity(sub=sub, email=email)


def _invalid() -> InvalidGoogleTokenError:
    return InvalidGoogleTokenError("Google ID token is invalid")
