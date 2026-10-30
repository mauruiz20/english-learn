from datetime import timedelta
from typing import Any
from uuid import UUID

import jwt
import pytest

from english_learn_api.auth.domain.errors import InvalidAccessTokenError
from english_learn_api.auth.infrastructure.jwt_access_tokens import (
    AUDIENCE,
    ISSUER,
    JwtAccessTokens,
)
from tests.fakes import T0

SECRET = "s" * 32
USER_ID = UUID("01900000-0000-7000-8000-000000000001")
TTL = timedelta(minutes=15)


@pytest.fixture
def tokens() -> JwtAccessTokens:
    return JwtAccessTokens(secret=SECRET, ttl=TTL)


def forge(**overrides: Any) -> str:
    claims = {
        "sub": str(USER_ID),
        "iat": int(T0.timestamp()),
        "exp": int((T0 + TTL).timestamp()),
        "iss": ISSUER,
        "aud": AUDIENCE,
        **overrides,
    }
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, SECRET, "HS256")


def test_issues_an_hs256_jwt_with_the_expected_claims(tokens: JwtAccessTokens) -> None:
    access = tokens.issue(USER_ID, T0 + timedelta(microseconds=999))

    assert jwt.get_unverified_header(access.value)["alg"] == "HS256"
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
    }
    assert access.expires_at == T0 + TTL


def test_verifies_its_own_tokens(tokens: JwtAccessTokens) -> None:
    access = tokens.issue(USER_ID, T0)

    assert tokens.verify(access.value, T0 + TTL - timedelta(seconds=1)) == USER_ID


def test_rejects_expired_tokens(tokens: JwtAccessTokens) -> None:
    access = tokens.issue(USER_ID, T0)

    with pytest.raises(InvalidAccessTokenError):
        tokens.verify(access.value, T0 + TTL)


def test_rejects_tokens_issued_in_the_future(tokens: JwtAccessTokens) -> None:
    access = tokens.issue(USER_ID, T0 + timedelta(minutes=5))

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
        pytest.param(
            jwt.encode({"sub": str(USER_ID)}, "x" * 32, "HS256"), id="signed with another key"
        ),
        pytest.param(
            jwt.encode({"sub": str(USER_ID), "iss": ISSUER, "aud": AUDIENCE}, "", algorithm="none"),
            id="alg none",
        ),
        pytest.param(forge()[:-2] + "xx", id="tampered signature"),
        pytest.param("garbage", id="not a JWT"),
        pytest.param("", id="empty"),
    ],
)
def test_rejects_invalid_tokens(tokens: JwtAccessTokens, token: str) -> None:
    with pytest.raises(InvalidAccessTokenError):
        tokens.verify(token, T0)
