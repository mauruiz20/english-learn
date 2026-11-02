"""Composition root: builds the FastAPI app and wires adapters into use cases.

Run locally with `uv run uvicorn english_learn_api.main:app_from_env --factory --reload`.
"""

import asyncio
import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from fastapi import FastAPI

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
from english_learn_api.shared.middleware import (
    Admission,
    AdmissionMiddleware,
    BodySizeLimitMiddleware,
    PathCorsMiddleware,
    RequestLogMiddleware,
)
from english_learn_api.shared.periodic import run_periodically
from english_learn_api.shared.rate_limit import Rate, TokenBucketLimiter, limit_by_client_ip
from english_learn_api.sync.api.router import STATUS_BY_ERROR as SYNC_STATUS_BY_ERROR
from english_learn_api.sync.api.router import build_sync_router
from english_learn_api.sync.application.use_cases import SyncProgress
from english_learn_api.sync.infrastructure.sqlalchemy_unit_of_work import SqlAlchemySyncUnitOfWork
from english_learn_api.transfers.api.admission import (
    DEFAULT_CREATE_WAIT_SECONDS,
    DEFAULT_MAX_CONCURRENT_CREATES,
    ConcurrencySlots,
    claim_admission,
    create_admission,
)
from english_learn_api.transfers.api.router import CLAIM_PATH, CREATE_PATH, build_transfers_router
from english_learn_api.transfers.api.router import STATUS_BY_ERROR as TRANSFER_STATUS_BY_ERROR
from english_learn_api.transfers.application.use_cases import (
    ClaimTransfer,
    CreateTransfer,
    PurgeStaleTransfers,
)
from english_learn_api.transfers.domain.limits import MAX_TRANSFER_BODY_BYTES, PURGE_INTERVAL
from english_learn_api.transfers.infrastructure.sqlalchemy_unit_of_work import (
    SqlAlchemyTransferUnitOfWork,
)

SIGN_IN_RATE = Rate(10, timedelta(minutes=1))
REFRESH_RATE = Rate(30, timedelta(minutes=1))
LOGOUT_RATE = Rate(30, timedelta(minutes=1))
DELETE_ACCOUNT_RATE = Rate(5, timedelta(hours=1))
SYNC_RATE = Rate(60, timedelta(minutes=1))
CREATE_TRANSFER_RATE = Rate(5, timedelta(hours=1))
CREATE_TRANSFER_GLOBAL_RATE = Rate(100, timedelta(hours=1))
CLAIM_TRANSFER_RATE = Rate(20, timedelta(hours=1))


@dataclass(frozen=True, slots=True)
class RateLimits:
    """Per client IP for the auth and transfer endpoints, per user for account deletion and sync;
    `create_transfer_global` counts every client's creates together."""

    sign_in: Rate = SIGN_IN_RATE
    refresh: Rate = REFRESH_RATE
    logout: Rate = LOGOUT_RATE
    delete_account: Rate = DELETE_ACCOUNT_RATE
    sync: Rate = SYNC_RATE
    create_transfer: Rate = CREATE_TRANSFER_RATE
    create_transfer_global: Rate = CREATE_TRANSFER_GLOBAL_RATE
    claim_transfer: Rate = CLAIM_TRANSFER_RATE


def create_app(
    settings: Settings,
    *,
    google_verifier: GoogleTokenVerifier | None = None,
    clock: Clock | None = None,
    rate_limits: RateLimits | None = None,
    google_concurrency: tuple[int, float] = (DEFAULT_MAX_CONCURRENT, DEFAULT_WAIT_SECONDS),
    transfer_concurrency: tuple[int, float] = (
        DEFAULT_MAX_CONCURRENT_CREATES,
        DEFAULT_CREATE_WAIT_SECONDS,
    ),
    transfer_purge_interval: timedelta = PURGE_INTERVAL,
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

    def transfer_unit_of_work() -> SqlAlchemyTransferUnitOfWork:
        return SqlAlchemyTransferUnitOfWork(session_factory)

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

    purge_stale_transfers = PurgeStaleTransfers(unit_of_work=transfer_unit_of_work, clock=clock)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        purging = asyncio.create_task(
            run_periodically(
                purge_stale_transfers.execute, transfer_purge_interval, name="transfer purge"
            )
        )
        try:
            yield
        finally:
            purging.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await purging
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
    install_error_handlers(
        app,
        status_by_error=AUTH_STATUS_BY_ERROR | SYNC_STATUS_BY_ERROR | TRANSFER_STATUS_BY_ERROR,
    )

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

    app.include_router(
        build_transfers_router(
            create=CreateTransfer(unit_of_work=transfer_unit_of_work, clock=clock),
            claim=ClaimTransfer(unit_of_work=transfer_unit_of_work, clock=clock),
        )
    )

    # Added last = outermost: CORS headers also land on 413, 429 and 503 responses.
    app.add_middleware(
        BodySizeLimitMiddleware,
        max_bytes=settings.max_request_body_bytes,
        max_bytes_by_path={CREATE_PATH: MAX_TRANSFER_BODY_BYTES},
    )
    app.add_middleware(
        AdmissionMiddleware, by_path=transfer_admissions(limits, client_ip, transfer_concurrency)
    )
    app.add_middleware(RequestLogMiddleware)
    app.add_middleware(PathCorsMiddleware, **cors_policies(settings))
    return app


def transfer_admissions(
    limits: RateLimits, client_ip: ClientIpResolver, concurrency: tuple[int, float]
) -> dict[str, Admission]:
    """The transfer routes' limits, taken before their bodies are read."""
    max_concurrent, wait_seconds = concurrency
    return {
        CREATE_PATH: create_admission(
            per_client=TokenBucketLimiter(limits.create_transfer),
            everyone=TokenBucketLimiter(limits.create_transfer_global),
            slots=ConcurrencySlots(max_concurrent, wait_seconds),
            client_ip=client_ip,
        ),
        CLAIM_PATH: claim_admission(
            per_client=TokenBucketLimiter(limits.claim_transfer), client_ip=client_ip
        ),
    }


def cors_policies(settings: Settings) -> dict[str, Any]:
    """Credentialed CORS for the app's own origins; anonymous CORS for the transfer routes."""

    def anonymous(origins: list[str]) -> dict[str, Any]:
        # No cookie, no bearer: nothing but JSON crosses, so no credentials are allowed.
        return {
            "allow_origins": list(dict.fromkeys(origins)),
            "allow_methods": ["POST"],
            "allow_headers": ["Content-Type"],
            "allow_credentials": False,
            "max_age": 600,
        }

    return {
        "default": {
            "allow_origins": settings.cors_origins,
            "allow_methods": ["GET", "POST", "DELETE"],
            "allow_headers": [
                "Authorization",
                "Content-Type",
                "X-Token-Transport",
                "X-Requested-With",
            ],
            # The web app's refresh cookie (cookie token transport) needs credentialed CORS; the
            # origins are an exact list (settings refuse "*"), and no response header is exposed.
            "allow_credentials": True,
            "max_age": 600,
        },
        "by_path": {
            # The old site hands its progress over; the app itself may create one too.
            CREATE_PATH: anonymous([*settings.transfer_source_origins, *settings.cors_origins]),
            # Only the app's own site takes a transfer in.
            CLAIM_PATH: anonymous(settings.cors_origins),
        },
    }


def client_ip_resolver(settings: Settings) -> ClientIpResolver:
    """The single source of client addresses: every per-IP limit (and any IP logging) uses it."""
    if settings.client_ip_source == "cf-connecting-ip":
        return cf_connecting_ip(settings.trusted_proxy_cidrs)
    return socket_client_ip


def app_from_env() -> FastAPI:
    settings = Settings()  # values come from the environment
    configure_logging(settings.log_level)
    return create_app(settings)
