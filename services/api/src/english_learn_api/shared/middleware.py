"""Pure ASGI middlewares (no `BaseHTTPMiddleware`, so streaming and errors behave predictably)."""

import logging
import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from english_learn_api.shared.errors import error_response

logger = logging.getLogger("english_learn_api.request")


class _BodyTooLargeError(Exception):
    pass


class BodySizeLimitMiddleware:
    """Rejects request bodies over `max_bytes` with 413, by header or while streaming."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            await self._reject(scope, receive, send)
            return

        received = 0
        too_large = False
        replaced = False

        async def limited_receive() -> Message:
            nonlocal received, too_large
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
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
                await self._reject(scope, receive, send)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except _BodyTooLargeError:
            if not replaced:
                await self._reject(scope, receive, send)

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = error_response(
            413,
            "payload_too_large",
            f"Request body exceeds {self.max_bytes} bytes",
            {"Connection": "close"},
        )
        await response(scope, receive, send)


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
