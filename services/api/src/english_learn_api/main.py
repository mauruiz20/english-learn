"""Composition root: builds the FastAPI app and wires adapters into use cases.

Run locally with `uv run uvicorn english_learn_api.main:app_from_env --factory --reload`.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from english_learn_api.account.api import build_account_router
from english_learn_api.account.application import DeleteAccount, GetProfile
from english_learn_api.auth.api.bearer import build_current_user_id
from english_learn_api.auth.api.router import STATUS_BY_ERROR, build_auth_router
from english_learn_api.auth.application.ports import GoogleTokenVerifier
from english_learn_api.auth.application.use_cases import (
    Logout,
    RefreshSession,
    SessionIssuer,
    SignInWithGoogle,
)
from english_learn_api.auth.infrastructure.google_verifier import GoogleIdTokenVerifier
from english_learn_api.auth.infrastructure.jwt_access_tokens import JwtAccessTokens
from english_learn_api.auth.infrastructure.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from english_learn_api.health.api import build_health_router
from english_learn_api.settings import Settings
from english_learn_api.shared.clock import Clock, SystemClock
from english_learn_api.shared.database import create_engine, create_session_factory
from english_learn_api.shared.errors import install_error_handlers
from english_learn_api.shared.logging import configure_logging
from english_learn_api.shared.middleware import BodySizeLimitMiddleware, RequestLogMiddleware


def create_app(
    settings: Settings,
    *,
    google_verifier: GoogleTokenVerifier | None = None,
    clock: Clock | None = None,
) -> FastAPI:
    """Build the app. Tests swap the Google verifier and the clock; everything else is real."""
    clock = clock or SystemClock()
    google_verifier = google_verifier or GoogleIdTokenVerifier(
        client_ids=settings.google_client_ids
    )
    engine = create_engine(settings.database_url)
    session_factory = create_session_factory(engine)

    def unit_of_work() -> SqlAlchemyUnitOfWork:
        return SqlAlchemyUnitOfWork(session_factory)

    access_tokens = JwtAccessTokens(
        secret=settings.jwt_secret.get_secret_value(), ttl=settings.access_token_ttl
    )
    sessions = SessionIssuer(
        access_tokens=access_tokens,
        refresh_token_ttl=settings.refresh_token_ttl,
        max_lifetime=settings.session_max_lifetime,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        await engine.dispose()

    app = FastAPI(title="English Learn API", version="0.1.0", lifespan=lifespan)
    install_error_handlers(app, status_by_error=STATUS_BY_ERROR)

    app.include_router(build_health_router(engine))
    app.include_router(
        build_auth_router(
            sign_in=SignInWithGoogle(
                verifier=google_verifier,
                sessions=sessions,
                unit_of_work=unit_of_work,
                clock=clock,
            ),
            refresh=RefreshSession(
                sessions=sessions,
                unit_of_work=unit_of_work,
                clock=clock,
                retry_grace=settings.refresh_retry_grace,
            ),
            logout=Logout(unit_of_work=unit_of_work, clock=clock),
        )
    )
    app.include_router(
        build_account_router(
            current_user_id=build_current_user_id(access_tokens, clock),
            get_profile=GetProfile(unit_of_work=unit_of_work),
            delete_account=DeleteAccount(unit_of_work=unit_of_work),
        )
    )

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
