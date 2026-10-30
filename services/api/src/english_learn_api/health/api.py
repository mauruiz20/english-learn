"""Liveness plus a database ping, for the host's health checks (Render) and uptime monitors."""

import asyncio
import logging

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

from english_learn_api.shared.errors import ApiError

logger = logging.getLogger(__name__)
PING_TIMEOUT_SECONDS = 3


def build_health_router(engine: AsyncEngine) -> APIRouter:
    router = APIRouter(tags=["health"])

    @router.get("/healthz")
    async def healthz() -> dict[str, str]:
        try:
            async with asyncio.timeout(PING_TIMEOUT_SECONDS), engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
        except (SQLAlchemyError, OSError, TimeoutError) as error:
            logger.warning("database ping failed", extra={"error": type(error).__name__})
            raise ApiError(503, "database_unavailable", "Database is unreachable") from error
        return {"status": "ok"}

    return router
