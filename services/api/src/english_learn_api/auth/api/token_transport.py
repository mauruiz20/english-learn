"""How the refresh token travels: in the JSON body, or in an HttpOnly cookie (web).

The client picks per request with `X-Token-Transport`; without the header the API keeps its
original JSON contract (`body`). In `cookie` mode the refresh token never reaches JavaScript:
sign-in and refresh set it as `el_rt` (HttpOnly, Secure, SameSite=Strict, Path=/v1/auth,
host-only), and refresh and logout read it from there. Those two cookie-authenticated calls also
need `X-Requested-With: english-learn` (a custom header forces a CORS preflight) and an `Origin`
from the CORS allowlist, as CSRF defense in depth behind SameSite=Strict.
"""

from collections.abc import Collection
from datetime import datetime
from enum import StrEnum
from typing import Annotated

from fastapi import Header, Request, Response, status

from english_learn_api.shared.errors import ApiError

REFRESH_COOKIE = "el_rt"
REFRESH_COOKIE_PATH = "/v1/auth"
REQUESTED_WITH = "english-learn"
CSRF_REJECTED = "csrf_rejected"


class TokenTransport(StrEnum):
    BODY = "body"
    COOKIE = "cookie"


TokenTransportHeader = Annotated[
    TokenTransport,
    Header(
        alias="X-Token-Transport",
        description=(
            "`cookie` (web): the refresh token travels in the HttpOnly `el_rt` cookie and is "
            "left out of the JSON. `body` (default): it travels in the JSON body."
        ),
    ),
]

RequestedWithHeader = Annotated[
    str | None,
    Header(
        alias="X-Requested-With",
        description="Cookie mode only: must be `english-learn` (CSRF defense).",
    ),
]


class RefreshCookies:
    """Writes the refresh cookie with fixed attributes; only `Secure` is configurable."""

    def __init__(self, *, secure: bool) -> None:
        attributes = ["HttpOnly", "Secure", "SameSite=Strict", f"Path={REFRESH_COOKIE_PATH}"]
        if not secure:
            attributes.remove("Secure")
        self._attributes = "; ".join(attributes)

    def set(self, response: Response, token: str, *, expires_at: datetime, now: datetime) -> None:
        max_age = max(int((expires_at - now).total_seconds()), 0)
        response.headers.append("set-cookie", self._header(token, max_age))

    def clearing_header(self) -> dict[str, str]:
        return {"set-cookie": self._header("", 0)}

    def clear(self, response: Response) -> None:
        response.headers.append("set-cookie", self._header("", 0))

    def _header(self, value: str, max_age: int) -> str:
        return f"{REFRESH_COOKIE}={value}; {self._attributes}; Max-Age={max_age}"


def require_csrf_headers(
    request: Request, requested_with: str | None, allowed_origins: Collection[str]
) -> None:
    """Cookie-authenticated calls must come from the web app's own JavaScript."""
    origin = request.headers.get("origin")
    if requested_with != REQUESTED_WITH or origin is None or origin not in allowed_origins:
        raise ApiError(
            status.HTTP_403_FORBIDDEN,
            CSRF_REJECTED,
            "Cookie requests need X-Requested-With: english-learn and an allowed Origin",
        )
