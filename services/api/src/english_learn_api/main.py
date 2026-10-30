"""Composition root: builds the FastAPI app and wires adapters into use cases.

Run locally with `uv run uvicorn english_learn_api.main:app_from_env --factory --reload`.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from english_learn_api.settings import Settings
from english_learn_api.shared.database import create_engine
from english_learn_api.shared.errors import install_error_handlers
from english_learn_api.shared.logging import configure_logging
from english_learn_api.shared.middleware import BodySizeLimitMiddleware, RequestLogMiddleware


def create_app(settings: Settings) -> FastAPI:
    engine = create_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        await engine.dispose()

    app = FastAPI(title="English Learn API", version="0.1.0", lifespan=lifespan)
    install_error_handlers(app, status_by_error={})

    # Added last = outermost: CORS headers also land on 413 responses.
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_request_body_bytes)
    app.add_middleware(RequestLogMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        allow_credentials=False,  # tokens travel in the Authorization header, never cookies
        max_age=600,
    )
    return app


def app_from_env() -> FastAPI:
    settings = Settings()  # values come from the environment
    configure_logging(settings.log_level)
    return create_app(settings)
