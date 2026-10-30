"""Sign in with Google, refresh a session (rotation + reuse detection) and log out."""

import logging
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta
from uuid import UUID

from english_learn_api.auth.application.ports import (
    AccessTokens,
    GoogleTokenVerifier,
    UnitOfWork,
)
from english_learn_api.auth.domain.errors import InvalidRefreshTokenError, RefreshTokenReuseError
from english_learn_api.auth.domain.models import RefreshToken, SignedIn, TokenPair
from english_learn_api.auth.domain.refresh_secrets import hash_refresh_secret, new_refresh_secret
from english_learn_api.shared.clock import Clock

logger = logging.getLogger(__name__)

type UnitOfWorkFactory = Callable[[], UnitOfWork]

_INVALID_REFRESH = "Refresh token is invalid or expired; sign in again"


class SessionIssuer:
    """Creates a token pair: a short-lived access JWT and a stored, rotating refresh token."""

    def __init__(self, *, access_tokens: AccessTokens, refresh_token_ttl: timedelta) -> None:
        self._access_tokens = access_tokens
        self._refresh_token_ttl = refresh_token_ttl

    async def issue(
        self, uow: UnitOfWork, *, user_id: UUID, family_id: UUID, now: datetime
    ) -> tuple[TokenPair, RefreshToken]:
        secret = new_refresh_secret()
        record = RefreshToken(
            id=uuid.uuid7(),
            user_id=user_id,
            family_id=family_id,
            token_hash=hash_refresh_secret(secret),
            created_at=now,
            expires_at=now + self._refresh_token_ttl,
        )
        await uow.refresh_tokens.add(record)
        pair = TokenPair(
            access_token=self._access_tokens.issue(user_id, now),
            refresh_token=secret,
            refresh_token_expires_at=record.expires_at,
        )
        return pair, record


class SignInWithGoogle:
    def __init__(
        self,
        *,
        verifier: GoogleTokenVerifier,
        sessions: SessionIssuer,
        unit_of_work: UnitOfWorkFactory,
        clock: Clock,
    ) -> None:
        self._verifier = verifier
        self._sessions = sessions
        self._unit_of_work = unit_of_work
        self._clock = clock

    async def execute(self, id_token: str) -> SignedIn:
        identity = await self._verifier.verify(id_token)
        now = self._clock.now()
        async with self._unit_of_work() as uow:
            user, created = await uow.users.upsert_by_google_sub(identity, uuid.uuid7(), now)
            tokens, _ = await self._sessions.issue(
                uow, user_id=user.id, family_id=uuid.uuid7(), now=now
            )
            await uow.commit()
        logger.info("signed in", extra={"user_id": str(user.id), "new_user": created})
        return SignedIn(user=user, tokens=tokens, is_new_user=created)


class RefreshSession:
    def __init__(
        self, *, sessions: SessionIssuer, unit_of_work: UnitOfWorkFactory, clock: Clock
    ) -> None:
        self._sessions = sessions
        self._unit_of_work = unit_of_work
        self._clock = clock

    async def execute(self, refresh_token: str) -> TokenPair:
        now = self._clock.now()
        async with self._unit_of_work() as uow:
            current = await uow.refresh_tokens.get_by_hash_for_update(
                hash_refresh_secret(refresh_token)
            )
            if current is None:
                raise InvalidRefreshTokenError(_INVALID_REFRESH)

            if current.was_rotated:
                # Someone presented a token that was already exchanged: either the client or an
                # attacker holds a copy. We cannot tell which, so the whole family dies.
                await uow.refresh_tokens.revoke_family(current.family_id, now)
                await uow.commit()
                logger.warning(
                    "refresh token reuse detected; family revoked",
                    extra={"user_id": str(current.user_id), "family_id": str(current.family_id)},
                )
                msg = "Refresh token was already used; all sessions from that sign-in are revoked"
                raise RefreshTokenReuseError(msg)

            if current.is_revoked or current.is_expired(now):
                raise InvalidRefreshTokenError(_INVALID_REFRESH)

            tokens, successor = await self._sessions.issue(
                uow, user_id=current.user_id, family_id=current.family_id, now=now
            )
            await uow.refresh_tokens.save(current.rotated(successor.id, now))
            await uow.commit()
        return tokens


class Logout:
    """Revokes every token of the presented token's family. Unknown tokens are ignored."""

    def __init__(self, *, unit_of_work: UnitOfWorkFactory, clock: Clock) -> None:
        self._unit_of_work = unit_of_work
        self._clock = clock

    async def execute(self, refresh_token: str) -> None:
        async with self._unit_of_work() as uow:
            current = await uow.refresh_tokens.get_by_hash_for_update(
                hash_refresh_secret(refresh_token)
            )
            if current is None:
                return
            await uow.refresh_tokens.revoke_family(current.family_id, self._clock.now())
            await uow.commit()
