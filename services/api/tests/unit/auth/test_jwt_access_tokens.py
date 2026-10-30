import base64
import json
from datetime import timedelta
from typing import Any
from uuid import UUID

import jwt
import pytest

from english_learn_api.auth.domain.errors import InvalidAccessTokenError
from english_learn_api.auth.domain.models import AccessClaims
from english_learn_api.auth.infrastructure.jwt_access_tokens import (
    AUDIENCE,
    ISSUER,
    JwtAccessTokens,
)
from tests.fakes import T0

SECRET = "s" * 32
OLD_KID, OLD_SECRET = "2026-09", "o" * 32
ACTIVE_KID = "2026-10"
USER_ID = UUID("01900000-0000-7000-8000-000000000001")
TTL = timedelta(minutes=15)


@pytest.fixture
def tokens() -> JwtAccessTokens:
    return JwtAccessTokens(
        keys={ACTIVE_KID: SECRET, OLD_KID: OLD_SECRET}, active_kid=ACTIVE_KID, ttl=TTL
    )


def forge(*, kid: str | None = ACTIVE_KID, secret: str = SECRET, **overrides: Any) -> str:
    claims = {
        "sub": str(USER_ID),
        "iat": int(T0.timestamp()),
        "exp": int((T0 + TTL).timestamp()),
        "iss": ISSUER,
        "aud": AUDIENCE,
        "auth_time": int(T0.timestamp()),
        **overrides,
    }
    headers = None if kid is None else {"kid": kid}
    return jwt.encode(
        {k: v for k, v in claims.items() if v is not None}, secret, "HS256", headers=headers
    )


def with_header(token: str, header: dict[str, Any]) -> str:
    encoded = base64.urlsafe_b64encode(json.dumps(header).encode()).rstrip(b"=").decode()
    return ".".join([encoded, *token.split(".")[1:]])


def test_issues_an_hs256_jwt_with_the_expected_claims(tokens: JwtAccessTokens) -> None:
    access = tokens.issue(USER_ID, T0 + timedelta(microseconds=999), authenticated_at=T0)

    header = jwt.get_unverified_header(access.value)
    assert header["alg"] == "HS256"
    assert header["kid"] == ACTIVE_KID
    claims = jwt.decode(
        access.value,
        SECRET,
        algorithms=["HS256"],
        audience=AUDIENCE,
        options={"verify_exp": False},  # T0 is a fixed instant, possibly in the past
    )
    assert claims == {
        "sub": str(USER_ID),
        "iat": int(T0.timestamp()),
        "exp": int((T0 + TTL).timestamp()),
        "iss": ISSUER,
        "aud": AUDIENCE,
        "auth_time": int(T0.timestamp()),
    }
    assert access.expires_at == T0 + TTL


def test_verifies_its_own_tokens(tokens: JwtAccessTokens) -> None:
    access = tokens.issue(USER_ID, T0, authenticated_at=T0)

    assert tokens.verify(access.value, T0 + TTL - timedelta(seconds=1)).user_id == USER_ID


def test_carries_the_time_of_the_sign_in(tokens: JwtAccessTokens) -> None:
    """A refresh issues a new access token (new `iat`) but keeps the original `auth_time`."""
    access = tokens.issue(USER_ID, T0 + timedelta(days=3), authenticated_at=T0)

    claims = tokens.verify(access.value, T0 + timedelta(days=3))

    assert claims == AccessClaims(
        user_id=USER_ID, issued_at=T0 + timedelta(days=3), authenticated_at=T0
    )


def test_verifies_tokens_signed_with_any_listed_key(tokens: JwtAccessTokens) -> None:
    """During a rotation, tokens signed with the previous key stay valid until they expire."""
    assert tokens.verify(forge(kid=OLD_KID, secret=OLD_SECRET), T0).user_id == USER_ID


def test_rejects_expired_tokens(tokens: JwtAccessTokens) -> None:
    access = tokens.issue(USER_ID, T0, authenticated_at=T0)

    with pytest.raises(InvalidAccessTokenError):
        tokens.verify(access.value, T0 + TTL)


def test_rejects_tokens_issued_in_the_future(tokens: JwtAccessTokens) -> None:
    access = tokens.issue(USER_ID, T0 + timedelta(minutes=5), authenticated_at=T0)

    with pytest.raises(InvalidAccessTokenError):
        tokens.verify(access.value, T0)


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(forge(iss="someone-else"), id="wrong issuer"),
        pytest.param(forge(aud="another-app"), id="wrong audience"),
        pytest.param(forge(sub="not-a-uuid"), id="sub is not a user id"),
        pytest.param(forge(sub=None), id="missing sub"),
        pytest.param(forge(exp=None), id="missing exp"),
        pytest.param(forge(iat=None), id="missing iat"),
        pytest.param(forge(auth_time=None), id="missing auth_time"),
        pytest.param(forge(auth_time="yesterday"), id="auth_time is not a number"),
        pytest.param(
            jwt.encode({"sub": str(USER_ID)}, "x" * 32, "HS256"), id="signed with another key"
        ),
        pytest.param(
            jwt.encode({"sub": str(USER_ID), "iss": ISSUER, "aud": AUDIENCE}, "", algorithm="none"),
            id="alg none",
        ),
        pytest.param(forge()[:-2] + "xx", id="tampered signature"),
        pytest.param(forge(kid=None), id="no kid"),
        pytest.param(forge(kid="retired"), id="unknown kid"),
        pytest.param(forge(kid=OLD_KID), id="kid of another key"),
        pytest.param(with_header(forge(), {"alg": "HS256", "kid": ["x"]}), id="kid is a list"),
        pytest.param("garbage", id="not a JWT"),
        pytest.param("", id="empty"),
    ],
)
def test_rejects_invalid_tokens(tokens: JwtAccessTokens, token: str) -> None:
    with pytest.raises(InvalidAccessTokenError):
        tokens.verify(token, T0)
