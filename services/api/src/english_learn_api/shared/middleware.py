"""Pure ASGI middlewares (no `BaseHTTPMiddleware`, so streaming and errors behave predictably)."""

import logging
import time
from collections.abc import Mapping
from typing import Any

from starlette.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from english_learn_api.shared.errors import error_response

logger = logging.getLogger("english_learn_api.request")


class _BodyTooLargeError(Exception):
    pass


class BodySizeLimitMiddleware:
    """Rejects request bodies over `max_bytes` with 413, by header or while streaming.

    `max_bytes_by_path` sets another limit for exact paths (a route that takes a bigger body).
    """

    def __init__(
        self, app: ASGIApp, max_bytes: int, max_bytes_by_path: Mapping[str, int] | None = None
    ) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.max_bytes_by_path = dict(max_bytes_by_path or {})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        max_bytes = self.max_bytes_by_path.get(scope["path"], self.max_bytes)
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > max_bytes:
            await self._reject(scope, receive, send, max_bytes)
            return

        received = 0
        too_large = False
        replaced = False

        async def limited_receive() -> Message:
            nonlocal received, too_large
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > max_bytes:
                    too_large = True
                    raise _BodyTooLargeError
            return message

        async def guarded_send(message: Message) -> None:
            # Frameworks may turn the receive error into their own response (FastAPI answers
            # 400 "error parsing the body"); replace whatever comes with the 413.
            nonlocal replaced
            if not too_large:
                await send(message)
            elif not replaced:
                replaced = True
                await self._reject(scope, receive, send, max_bytes)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except _BodyTooLargeError:
            if not replaced:
                await self._reject(scope, receive, send, max_bytes)

    async def _reject(self, scope: Scope, receive: Receive, send: Send, max_bytes: int) -> None:
        response = error_response(
            413,
            "payload_too_large",
            f"Request body exceeds {max_bytes} bytes",
            {"Connection": "close"},
        )
        await response(scope, receive, send)


class PathCorsMiddleware:
    """CORS with a policy per exact path; every other path uses `default`.

    Each policy is a set of `CORSMiddleware` options, so preflights and responses of one path are
    answered by exactly that policy (origins, methods, headers, credentials).
    """

    def __init__(
        self,
        app: ASGIApp,
        default: Mapping[str, Any],
        by_path: Mapping[str, Mapping[str, Any]],
    ) -> None:
        self._default = CORSMiddleware(app, **default)
        self._by_path = {path: CORSMiddleware(app, **options) for path, options in by_path.items()}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        policy = (
            self._by_path.get(scope["path"], self._default) if scope["type"] == "http" else None
        )
        await (policy or self._default)(scope, receive, send)


class RequestLogMiddleware:
    """One structured line per request. It never logs bodies, headers or query strings."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started = time.perf_counter()
        status = 500

        async def capturing_send(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, capturing_send)
        finally:
            logger.info(
                "request",
                extra={
                    "http": {
                        "method": scope["method"],
                        "path": scope["path"],
                        "status": status,
                        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                    }
                },
            )
