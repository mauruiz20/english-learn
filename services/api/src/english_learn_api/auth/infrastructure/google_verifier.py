"""Verifies Google ID tokens with google-auth (`id_token.verify_oauth2_token`).

google-auth checks the RS256 signature against Google's certificates, `exp`/`iat`, the audience
(one of our OAuth client ids) and the issuer (`accounts.google.com`); we also check that `azp`,
when present, is one of our client ids and require a verified email.
It is synchronous, so it runs in a worker thread with a total timeout, and its certificate
download is cached (see `CachingRequest`).
"""

import asyncio
import re
import threading
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
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
NEGATIVE_CACHE_SECONDS = 10
MAX_STALE_SECONDS = 24 * 3600
TOTAL_TIMEOUT_SECONDS = 8
GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs"  # what google-auth fetches
_MAX_AGE = re.compile(r"max-age=(\d+)")
# A compact JWS: three base64url segments. Anything else is rejected before google-auth parses it.
_COMPACT_JWS = re.compile(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")


@dataclass(slots=True)
class _Cached:
    fresh_until: float
    response: transport.Response


@dataclass(slots=True)
class _Flight:
    """One fetch in progress; requests for the same URL wait for it instead of fetching again."""

    done: threading.Event = field(default_factory=threading.Event)
    outcome: transport.Response | BaseException | None = None


class CachingRequest(transport.Request):
    """Wraps a google-auth transport and caches successful GETs for their `max-age`.

    Google rotates its signing keys roughly daily and publishes `Cache-Control: max-age`, so
    without this every sign-in would download the certificates again. The lock only guards the
    cache's bookkeeping, never the network: one request per URL fetches (single flight) while
    the others wait for its result. When a refetch fails, the last good certificates are served
    for up to `MAX_STALE_SECONDS`; with nothing to serve, the failure is remembered for
    `NEGATIVE_CACHE_SECONDS` so an outage does not turn every sign-in into a slow timeout.
    """

    def __init__(
        self,
        inner: transport.Request,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._inner = inner
        self._monotonic = monotonic
        self._lock = threading.Lock()
        self._cache: dict[str, _Cached] = {}
        self._failed_until: dict[str, float] = {}
        self._flights: dict[str, _Flight] = {}

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
            now = self._monotonic()
            cached = self._cache.get(url)
            if cached is not None and cached.fresh_until > now:
                return cached.response
            if self._failed_until.get(url, 0.0) > now:
                return self._stale_or_raise(cached, now)
            flight = self._flights.get(url)
            leading = flight is None
            if flight is None:
                flight = self._flights[url] = _Flight()

        if not leading:
            return self._await(flight)

        outcome: transport.Response | BaseException
        try:
            outcome = self._inner(
                url, method, body, headers, timeout or REQUEST_TIMEOUT_SECONDS, **kwargs
            )
        except Exception as error:
            outcome = error
        with self._lock:
            del self._flights[url]
            outcome = self._settle(url, outcome)
            flight.outcome = outcome
            flight.done.set()
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    def _settle(
        self, url: str, outcome: transport.Response | BaseException
    ) -> transport.Response | BaseException:
        now = self._monotonic()
        if isinstance(outcome, transport.Response) and outcome.status == 200:  # noqa: PLR2004
            self._cache[url] = _Cached(now + _max_age(outcome), outcome)
            self._failed_until.pop(url, None)
            return outcome
        self._failed_until[url] = now + NEGATIVE_CACHE_SECONDS
        stale = self._cache.get(url)
        if stale is not None and now - stale.fresh_until <= MAX_STALE_SECONDS:
            return stale.response
        return outcome

    def _stale_or_raise(self, cached: _Cached | None, now: float) -> transport.Response:
        if cached is not None and now - cached.fresh_until <= MAX_STALE_SECONDS:
            return cached.response
        msg = "Google certificates failed to download moments ago"
        raise exceptions.TransportError(msg)

    @staticmethod
    def _await(flight: _Flight) -> transport.Response:
        if not flight.done.wait(REQUEST_TIMEOUT_SECONDS * 2):
            msg = "Timed out waiting for Google certificates"
            raise exceptions.TransportError(msg)
        outcome = flight.outcome
        if isinstance(outcome, BaseException):
            raise outcome
        assert outcome is not None  # noqa: S101 - set before `done`
        return outcome


def _max_age(response: transport.Response) -> int:
    for name, value in response.headers.items():
        if name.lower() == "cache-control" and (match := _MAX_AGE.search(value)):
            return int(match.group(1))
    return DEFAULT_CACHE_SECONDS


class GoogleIdTokenVerifier:
    def __init__(
        self,
        *,
        client_ids: Sequence[str],
        request: transport.Request | None = None,
        total_timeout: float = TOTAL_TIMEOUT_SECONDS,
    ) -> None:
        if not client_ids:
            msg = "at least one Google client id is required"
            raise ValueError(msg)
        self._client_ids = list(client_ids)
        self._request = CachingRequest(request or google_requests.Request())
        self._total_timeout = total_timeout

    async def verify(self, id_token: str) -> GoogleIdentity:
        try:
            async with asyncio.timeout(self._total_timeout):
                return await asyncio.to_thread(self._verify, id_token)
        except TimeoutError as error:
            # The worker thread finishes (bounded by the transport timeout) in the background.
            msg = "Google sign-in is temporarily unavailable"
            raise GoogleUnavailableError(msg) from error

    def _verify(self, id_token: str) -> GoogleIdentity:
        if not _COMPACT_JWS.fullmatch(id_token):
            raise _invalid()
        try:
            claims = google_id_token.verify_oauth2_token(
                id_token,
                self._request,
                audience=self._client_ids,
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

        # `azp` is the client that requested the token; when present it must be one of ours too.
        if "azp" in claims and claims["azp"] not in self._client_ids:
            raise _invalid()
        sub, email = claims.get("sub"), claims.get("email")
        if not isinstance(sub, str) or not sub or not isinstance(email, str) or not email:
            raise _invalid()
        if claims.get("email_verified") is not True:
            msg = "Google account email is not verified"
            raise GoogleEmailNotVerifiedError(msg)
        nonce = claims.get("nonce")
        return GoogleIdentity(sub=sub, email=email, nonce=nonce if isinstance(nonce, str) else None)


def _invalid() -> InvalidGoogleTokenError:
    return InvalidGoogleTokenError("Google ID token is invalid")
