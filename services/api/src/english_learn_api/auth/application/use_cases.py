"""Sign in with Google, refresh a session (rotation + reuse detection) and log out."""

import hmac
import logging
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import NoReturn

from english_learn_api.auth.application.ports import (
    AccessTokens,
    GoogleTokenVerifier,
    UnitOfWork,
)
from english_learn_api.auth.domain.errors import (
    InvalidGoogleTokenError,
    InvalidRefreshTokenError,
    RefreshTokenReuseError,
)
from english_learn_api.auth.domain.models import (
    GoogleIdentity,
    RefreshFamily,
    RefreshToken,
    SignedIn,
    TokenPair,
)
from english_learn_api.auth.domain.refresh_secrets import hash_refresh_secret, new_refresh_secret
from english_learn_api.shared.clock import Clock

logger = logging.getLogger(__name__)

type UnitOfWorkFactory = Callable[[], UnitOfWork]

_INVALID_REFRESH = "Refresh token is invalid or expired; sign in again"
DEFAULT_RETRY_GRACE = timedelta(seconds=45)
DEFAULT_SESSION_MAX_LIFETIME = timedelta(days=60)


class SessionIssuer:
    """Creates a token pair: a short-lived access JWT and a stored, rotating refresh token.

    A session (refresh family) ends after `refresh_token_ttl` without a refresh (idle timeout,
    slid forward by each rotation) or `max_lifetime` after the sign-in, whichever comes first.
    """

    def __init__(
        self,
        *,
        access_tokens: AccessTokens,
        refresh_token_ttl: timedelta,
        max_lifetime: timedelta = DEFAULT_SESSION_MAX_LIFETIME,
    ) -> None:
        self._access_tokens = access_tokens
        self._refresh_token_ttl = refresh_token_ttl
        self._max_lifetime = max_lifetime

    def ends_at(self, family: RefreshFamily) -> datetime:
        return family.created_at + self._max_lifetime

    async def issue(
        self, uow: UnitOfWork, *, family: RefreshFamily, now: datetime
    ) -> tuple[TokenPair, RefreshToken]:
        user_id = family.user_id
        secret = new_refresh_secret()
        record = RefreshToken(
            id=uuid.uuid7(),
            user_id=user_id,
            family_id=family.id,
            token_hash=hash_refresh_secret(secret),
            created_at=now,
            expires_at=min(now + self._refresh_token_ttl, self.ends_at(family)),
        )
        await uow.refresh_tokens.add(record)
        pair = TokenPair(
            access_token=self._access_tokens.issue(
                user_id, now, authenticated_at=family.created_at
            ),
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

    async def execute(self, id_token: str, *, nonce: str | None = None) -> SignedIn:
        """Sign in with a verified Google ID token.

        `nonce`: the value the client generated for this sign-in (OpenID Connect redirect flow).
        When given, the token's `nonce` claim must equal it, so a token captured from another
        sign-in cannot be replayed.
        """
        identity = await self._verifier.verify(id_token)
        if nonce is not None and not _same_nonce(identity, nonce):
            msg = "Google ID token is invalid"
            raise InvalidGoogleTokenError(msg)
        now = self._clock.now()
        async with self._unit_of_work() as uow:
            user, created = await uow.users.upsert_by_google_sub(identity, uuid.uuid7(), now)
            family = RefreshFamily(id=uuid.uuid7(), user_id=user.id, created_at=now)
            await uow.refresh_families.add(family)
            tokens, _ = await self._sessions.issue(uow, family=family, now=now)
            await uow.commit()
        logger.info("signed in", extra={"user_id": str(user.id), "new_user": created})
        return SignedIn(user=user, tokens=tokens, is_new_user=created)


def _same_nonce(identity: GoogleIdentity, expected: str) -> bool:
    if identity.nonce is None:
        return False
    return hmac.compare_digest(identity.nonce.encode(), expected.encode())


class RefreshSession:
    """Rotate a refresh token; revoke the family when a used token comes back.

    One exception keeps flaky networks from logging people out: a token rotated less than
    `retry_grace` ago whose successor was never used is a retry (the response was lost, or two
    requests raced). The unused successor is revoked and a new one issued in the same family, so
    exactly one token stays live. The window is measured from the presented token's rotation.
    """

    def __init__(
        self,
        *,
        sessions: SessionIssuer,
        unit_of_work: UnitOfWorkFactory,
        clock: Clock,
        retry_grace: timedelta = DEFAULT_RETRY_GRACE,
    ) -> None:
        self._sessions = sessions
        self._unit_of_work = unit_of_work
        self._clock = clock
        self._retry_grace = retry_grace

    async def execute(self, refresh_token: str) -> TokenPair:
        now = self._clock.now()
        async with self._unit_of_work() as uow:
            session = await lock_session(uow, refresh_token)
            if session is None:
                raise InvalidRefreshTokenError(_INVALID_REFRESH)
            family, current = session

            if family.is_revoked or now >= self._sessions.ends_at(family):
                raise InvalidRefreshTokenError(_INVALID_REFRESH)

            if current.was_rotated:
                retried = await self._retry(uow, family, current, now)
                if retried is not None:
                    await uow.commit()
                    return retried
                await self._revoke_for_reuse(uow, family, current, now)

            if current.is_revoked:
                # Revoked without being rotated while its family lives: a retry superseded it,
                # so whoever presents it is not the client that retried.
                await self._revoke_for_reuse(uow, family, current, now)

            if current.is_expired(now):
                raise InvalidRefreshTokenError(_INVALID_REFRESH)

            tokens, successor = await self._sessions.issue(uow, family=family, now=now)
            await uow.refresh_tokens.save(current.rotated(successor.id, now))
            await uow.commit()
        return tokens

    async def _retry(
        self, uow: UnitOfWork, family: RefreshFamily, current: RefreshToken, now: datetime
    ) -> TokenPair | None:
        rotated_at, successor_id = current.revoked_at, current.replaced_by
        if rotated_at is None or successor_id is None or now - rotated_at >= self._retry_grace:
            return None
        successor = await uow.refresh_tokens.get(successor_id)
        if successor is None or successor.is_revoked:  # used (rotated) or revoked
            return None
        await uow.refresh_tokens.save(successor.superseded(now))
        tokens, replacement = await self._sessions.issue(uow, family=family, now=now)
        await uow.refresh_tokens.save(current.rerouted(replacement.id))
        logger.info(
            "refresh retried within the grace window",
            extra={"user_id": str(current.user_id), "family_id": str(family.id)},
        )
        return tokens

    @staticmethod
    async def _revoke_for_reuse(
        uow: UnitOfWork, family: RefreshFamily, current: RefreshToken, now: datetime
    ) -> NoReturn:
        # Someone presented a token that was already exchanged: either the client or an
        # attacker holds a copy. We cannot tell which, so the whole family dies.
        await revoke_family(uow, family, now)
        await uow.commit()
        logger.warning(
            "refresh token reuse detected; family revoked",
            extra={"user_id": str(current.user_id), "family_id": str(family.id)},
        )
        msg = "Refresh token was already used; all sessions from that sign-in are revoked"
        raise RefreshTokenReuseError(msg)


class Logout:
    """Revokes every token of the presented token's family. Unknown tokens are ignored."""

    def __init__(self, *, unit_of_work: UnitOfWorkFactory, clock: Clock) -> None:
        self._unit_of_work = unit_of_work
        self._clock = clock

    async def execute(self, refresh_token: str) -> None:
        async with self._unit_of_work() as uow:
            session = await lock_session(uow, refresh_token)
            if session is None:
                return
            family, _ = session
            await revoke_family(uow, family, self._clock.now())
            await uow.commit()


async def lock_session(
    uow: UnitOfWork, refresh_token: str
) -> tuple[RefreshFamily, RefreshToken] | None:
    """Lock the presented token's user, family and the token itself, in that order.

    The family lock serializes every rotation and revocation in the family, so a revocation
    always sees every successor (READ COMMITTED gives each statement a fresh snapshot once the
    lock is granted). The user lock comes first, like the cascade of an account deletion, so the
    two wait for each other instead of deadlocking. None if any of them is gone.
    """
    token_hash = hash_refresh_secret(refresh_token)
    found = await uow.refresh_tokens.find_by_hash(token_hash)
    if found is None or not await uow.users.lock_against_deletion(found.user_id):
        return None
    family = await uow.refresh_families.get_for_update(found.family_id)
    current = await uow.refresh_tokens.get_by_hash_for_update(token_hash)
    if family is None or current is None:
        return None
    return family, current


async def revoke_family(uow: UnitOfWork, family: RefreshFamily, now: datetime) -> None:
    await uow.refresh_families.revoke(family.id, now)
    await uow.refresh_tokens.revoke_family(family.id, now)  # defense in depth
