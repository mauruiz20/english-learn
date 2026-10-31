"""Composition root: builds the FastAPI app and wires adapters into use cases.

Run locally with `uv run uvicorn english_learn_api.main:app_from_env --factory --reload`.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from english_learn_api.account.api import build_account_router
from english_learn_api.account.application import DeleteAccount, GetProfile
from english_learn_api.auth.api.bearer import build_current_claims
from english_learn_api.auth.api.router import STATUS_BY_ERROR as AUTH_STATUS_BY_ERROR
from english_learn_api.auth.api.router import build_auth_router
from english_learn_api.auth.api.token_transport import RefreshCookies
from english_learn_api.auth.application.ports import GoogleTokenVerifier
from english_learn_api.auth.application.use_cases import (
    Logout,
    RefreshSession,
    SessionIssuer,
    SignInWithGoogle,
)
from english_learn_api.auth.infrastructure.bounded_google_verifier import (
    DEFAULT_MAX_CONCURRENT,
    DEFAULT_WAIT_SECONDS,
    BoundedGoogleVerifier,
)
from english_learn_api.auth.infrastructure.google_verifier import GoogleIdTokenVerifier
from english_learn_api.auth.infrastructure.jwt_access_tokens import JwtAccessTokens
from english_learn_api.auth.infrastructure.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from english_learn_api.health.api import build_health_router
from english_learn_api.settings import Settings
from english_learn_api.shared.client_ip import (
    ClientIpResolver,
    cf_connecting_ip,
    socket_client_ip,
)
from english_learn_api.shared.clock import Clock, SystemClock
from english_learn_api.shared.database import create_engine, create_session_factory
from english_learn_api.shared.errors import install_error_handlers
from english_learn_api.shared.logging import configure_logging
from english_learn_api.shared.middleware import BodySizeLimitMiddleware, RequestLogMiddleware
from english_learn_api.shared.rate_limit import Rate, TokenBucketLimiter, limit_by_client_ip
from english_learn_api.sync.api.router import STATUS_BY_ERROR as SYNC_STATUS_BY_ERROR
from english_learn_api.sync.api.router import build_sync_router
from english_learn_api.sync.application.use_cases import SyncProgress
from english_learn_api.sync.infrastructure.sqlalchemy_unit_of_work import SqlAlchemySyncUnitOfWork

SIGN_IN_RATE = Rate(10, timedelta(minutes=1))
REFRESH_RATE = Rate(30, timedelta(minutes=1))
LOGOUT_RATE = Rate(30, timedelta(minutes=1))
DELETE_ACCOUNT_RATE = Rate(5, timedelta(hours=1))
SYNC_RATE = Rate(60, timedelta(minutes=1))


@dataclass(frozen=True, slots=True)
class RateLimits:
    """Per client IP for the auth endpoints, per user for account deletion and sync."""

    sign_in: Rate = SIGN_IN_RATE
    refresh: Rate = REFRESH_RATE
    logout: Rate = LOGOUT_RATE
    delete_account: Rate = DELETE_ACCOUNT_RATE
    sync: Rate = SYNC_RATE


def create_app(
    settings: Settings,
    *,
    google_verifier: GoogleTokenVerifier | None = None,
    clock: Clock | None = None,
    rate_limits: RateLimits | None = None,
    google_concurrency: tuple[int, float] = (DEFAULT_MAX_CONCURRENT, DEFAULT_WAIT_SECONDS),
) -> FastAPI:
    """Build the app. Tests swap the Google verifier and the clock; everything else is real."""
    clock = clock or SystemClock()
    limits = rate_limits or RateLimits()
    max_concurrent, wait_seconds = google_concurrency
    google_verifier = BoundedGoogleVerifier(
        google_verifier or GoogleIdTokenVerifier(client_ids=settings.google_client_ids),
        max_concurrent=max_concurrent,
        wait_seconds=wait_seconds,
    )
    engine = create_engine(settings.database_url)
    session_factory = create_session_factory(engine)

    def unit_of_work() -> SqlAlchemyUnitOfWork:
        return SqlAlchemyUnitOfWork(session_factory)

    def sync_unit_of_work() -> SqlAlchemySyncUnitOfWork:
        return SqlAlchemySyncUnitOfWork(session_factory)

    client_ip = client_ip_resolver(settings)
    jwt_keys, active_kid = settings.jwt_signing_keys()
    access_tokens = JwtAccessTokens(
        keys=jwt_keys, active_kid=active_kid, ttl=settings.access_token_ttl
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

    # Production does not publish its schema; `python -m english_learn_api.export_openapi`
    # writes it for client generation instead.
    public_docs = not settings.is_production
    app = FastAPI(
        title="English Learn API",
        version="0.1.0",
        lifespan=lifespan,
        openapi_url="/openapi.json" if public_docs else None,
        docs_url="/docs" if public_docs else None,
        redoc_url="/redoc" if public_docs else None,
    )
    install_error_handlers(app, status_by_error=AUTH_STATUS_BY_ERROR | SYNC_STATUS_BY_ERROR)

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
            sign_in_limit=limit_by_client_ip(TokenBucketLimiter(limits.sign_in), client_ip),
            refresh_limit=limit_by_client_ip(TokenBucketLimiter(limits.refresh), client_ip),
            logout_limit=limit_by_client_ip(TokenBucketLimiter(limits.logout), client_ip),
            clock=clock,
            cookies=RefreshCookies(secure=settings.refresh_cookie_secure),
            allowed_origins=frozenset(settings.cors_origins),
        )
    )
    current_claims = build_current_claims(access_tokens, unit_of_work, clock)
    app.include_router(
        build_account_router(
            current_claims=current_claims,
            get_profile=GetProfile(unit_of_work=unit_of_work),
            delete_account=DeleteAccount(
                unit_of_work=unit_of_work,
                clock=clock,
                reauthentication_window=settings.reauthentication_window,
            ),
            delete_limiter=TokenBucketLimiter(limits.delete_account),
        )
    )
    app.include_router(
        build_sync_router(
            current_claims=current_claims,
            sync=SyncProgress(unit_of_work=sync_unit_of_work, clock=clock),
            limiter=TokenBucketLimiter(limits.sync),
        )
    )

    # Added last = outermost: CORS headers also land on 413 responses.
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_request_body_bytes)
    app.add_middleware(RequestLogMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Token-Transport", "X-Requested-With"],
        # The web app's refresh cookie (cookie token transport) needs credentialed CORS; the
        # origins are an exact list (settings refuse "*"), and no response header is exposed.
        allow_credentials=True,
        max_age=600,
    )
    return app


def client_ip_resolver(settings: Settings) -> ClientIpResolver:
    """The single source of client addresses: every per-IP limit (and any IP logging) uses it."""
    if settings.client_ip_source == "cf-connecting-ip":
        return cf_connecting_ip(settings.trusted_proxy_cidrs)
    return socket_client_ip


def app_from_env() -> FastAPI:
    settings = Settings()  # values come from the environment
    configure_logging(settings.log_level)
    return create_app(settings)
