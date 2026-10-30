"""One error shape for every response: `{"error": {"code": ..., "message": ...}}`.

Domain code raises `DomainError` subclasses (no HTTP knowledge); each feature's API layer maps
them to a status code. Anything unexpected becomes a generic 500 and is only logged server side.
"""

import logging
from collections.abc import Mapping
from typing import ClassVar

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

_CODES_BY_STATUS = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    413: "payload_too_large",
    422: "validation_error",
    500: "internal_error",
    503: "service_unavailable",
}


class DomainError(Exception):
    """A business rule refused the operation. `code` is a stable, machine-readable identifier."""

    code: ClassVar[str] = "domain_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class ApiError(Exception):
    """An HTTP-level failure raised from the API layer (for example, a missing bearer token)."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = dict(headers or {})


def error_response(
    status_code: int, code: str, message: str, headers: Mapping[str, str] | None = None
) -> JSONResponse:
    merged = dict(headers or {})
    if status_code == 401:  # noqa: PLR2004 - RFC 6750 requires a challenge on every 401
        merged.setdefault("WWW-Authenticate", "Bearer")
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
        headers=merged,
    )


def install_error_handlers(app: FastAPI, status_by_error: Mapping[type[DomainError], int]) -> None:
    def status_for(error: DomainError) -> int:
        for error_type in type(error).__mro__:
            if issubclass(error_type, DomainError) and error_type in status_by_error:
                return status_by_error[error_type]
        return 400

    async def handle(request: Request, exc: Exception) -> JSONResponse:
        match exc:
            case DomainError():
                return error_response(status_for(exc), exc.code, exc.message)
            case ApiError():
                return error_response(exc.status_code, exc.code, exc.message, exc.headers)
            case StarletteHTTPException():
                code = _CODES_BY_STATUS.get(exc.status_code, "http_error")
                return error_response(exc.status_code, code, str(exc.detail), exc.headers)
            case RequestValidationError():
                problems = "; ".join(
                    f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
                    for error in exc.errors()
                )
                return error_response(422, "validation_error", problems or "Invalid request")
            case _:
                logger.error(
                    "unhandled error",
                    exc_info=exc,
                    extra={"http": {"method": request.method, "path": request.url.path}},
                )
                return error_response(500, "internal_error", "Internal server error")

    for error_type in (
        DomainError,
        ApiError,
        StarletteHTTPException,
        RequestValidationError,
        Exception,
    ):
        app.add_exception_handler(error_type, handle)
