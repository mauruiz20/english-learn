"""The google-auth adapter, exercised offline with our own signing key and certificate endpoint."""

import base64
import json
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from google.auth import crypt, transport
from google.auth import jwt as google_jwt

from english_learn_api.auth.domain.errors import (
    GoogleEmailNotVerifiedError,
    GoogleUnavailableError,
    InvalidGoogleTokenError,
)
from english_learn_api.auth.domain.models import GoogleIdentity
from english_learn_api.auth.infrastructure.google_verifier import (
    CachingRequest,
    GoogleIdTokenVerifier,
)

CLIENT_ID = "test-client.apps.googleusercontent.com"
KID = "test-key"


def make_key_and_cert() -> tuple[bytes, str]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test")])
    now = datetime.now(UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=1))
        .sign(key, hashes.SHA256())
    )
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    return private_pem, cert.public_bytes(serialization.Encoding.PEM).decode()


PRIVATE_PEM, CERT_PEM = make_key_and_cert()
OTHER_PRIVATE_PEM, _ = make_key_and_cert()


class FakeResponse(transport.Response):
    def __init__(self, status: int, data: bytes, headers: dict[str, str]) -> None:
        self._status, self._data, self._headers = status, data, headers

    @property
    def status(self) -> int:
        return self._status

    @property
    def headers(self) -> dict[str, str]:
        return self._headers

    @property
    def data(self) -> bytes:
        return self._data


class FakeCertsEndpoint(transport.Request):
    """Serves our certificate the way https://www.googleapis.com/oauth2/v1/certs does."""

    def __init__(self, status: int = 200, max_age: int = 3600) -> None:
        self.status = status
        self.max_age = max_age
        self.calls = 0

    def __call__(self, url: str, method: str = "GET", *_: Any, **__: Any) -> transport.Response:
        self.calls += 1
        body = json.dumps({KID: CERT_PEM}).encode()
        return FakeResponse(self.status, body, {"cache-control": f"public, max-age={self.max_age}"})


def id_token(private_pem: bytes = PRIVATE_PEM, **overrides: Any) -> str:
    now = int(time.time())
    claims = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "1234567890",
        "email": "ana@example.com",
        "email_verified": True,
        "iat": now,
        "exp": now + 3600,
        **overrides,
    }
    signer = crypt.RSASigner.from_string(private_pem, key_id=KID)
    payload = {key: value for key, value in claims.items() if value is not None}
    return google_jwt.encode(signer, payload).decode()


def verifier(endpoint: FakeCertsEndpoint | None = None) -> GoogleIdTokenVerifier:
    return GoogleIdTokenVerifier(client_id=CLIENT_ID, request=endpoint or FakeCertsEndpoint())


async def test_returns_the_identity_of_a_valid_token() -> None:
    identity = await verifier().verify(id_token())

    assert identity == GoogleIdentity(sub="1234567890", email="ana@example.com")


async def test_accepts_the_issuer_without_scheme() -> None:
    assert await verifier().verify(id_token(iss="accounts.google.com"))


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(id_token(aud="another-client"), id="another audience"),
        pytest.param(id_token(iss="https://evil.example"), id="another issuer"),
        pytest.param(id_token(exp=int(time.time()) - 600), id="expired"),
        pytest.param(id_token(private_pem=OTHER_PRIVATE_PEM), id="signed with another key"),
        pytest.param(id_token(email=None), id="no email"),
        pytest.param("garbage", id="not a JWT"),
    ],
)
async def test_rejects_invalid_tokens(token: str) -> None:
    with pytest.raises(InvalidGoogleTokenError):
        await verifier().verify(token)


def crafted(header: object, payload: object = None, signature: bytes = b"sig") -> str:
    def segment(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode()

    claims = payload if payload is not None else {"iss": "accounts.google.com", "aud": CLIENT_ID}
    return ".".join(
        [
            segment(json.dumps(header).encode()),
            segment(json.dumps(claims).encode()),
            segment(signature),
        ]
    )


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(crafted({"alg": ["RS256"], "kid": KID}), id="alg is a list"),
        pytest.param(crafted({"alg": "RS256", "kid": ["x"]}), id="kid is a list"),
        pytest.param(crafted({"alg": "RS256", "kid": {"a": 1}}), id="kid is an object"),
        pytest.param(crafted(["RS256"]), id="header is a list"),
        pytest.param(crafted("RS256"), id="header is a string"),
        pytest.param(crafted({"alg": "RS256", "kid": KID}, payload=[1, 2]), id="payload is a list"),
        pytest.param(crafted({"alg": "RS256", "kid": KID}, payload=42), id="payload is a number"),
        pytest.param(crafted({"alg": "RS256", "kid": KID}) + ".extra", id="four segments"),
        pytest.param("a.b", id="two segments"),
        pytest.param("..", id="empty segments"),
        pytest.param("abc.d*f.ghi", id="not base64url"),
        pytest.param("a" * 4000, id="one long segment"),
    ],
)
async def test_rejects_malformed_tokens_with_401_not_500(token: str) -> None:
    with pytest.raises(InvalidGoogleTokenError):
        await verifier().verify(token)


@pytest.mark.parametrize("email_verified", [False, None, "true"])
async def test_requires_a_verified_email(email_verified: object) -> None:
    with pytest.raises(GoogleEmailNotVerifiedError):
        await verifier().verify(id_token(email_verified=email_verified))


async def test_reports_google_as_unavailable_when_certificates_cannot_be_fetched() -> None:
    with pytest.raises(GoogleUnavailableError):
        await verifier(FakeCertsEndpoint(status=503)).verify(id_token())


async def test_caches_the_certificates() -> None:
    endpoint = FakeCertsEndpoint()
    google = verifier(endpoint)

    await google.verify(id_token())
    await google.verify(id_token())

    assert endpoint.calls == 1


def test_the_cache_honors_max_age() -> None:
    endpoint = FakeCertsEndpoint(max_age=60)
    now = [1000.0]
    request = CachingRequest(endpoint, monotonic=lambda: now[0])

    request("https://certs")
    now[0] += 59
    request("https://certs")
    assert endpoint.calls == 1

    now[0] += 2
    request("https://certs")
    assert endpoint.calls == 2


def test_the_cache_skips_failed_responses() -> None:
    endpoint = FakeCertsEndpoint(status=500)
    request = CachingRequest(endpoint)

    request("https://certs")
    request("https://certs")

    assert endpoint.calls == 2


@pytest.mark.google_network
async def test_the_real_google_endpoint_rejects_a_forged_token() -> None:
    """Opt in with RUN_GOOGLE_NETWORK_TESTS=1: fetches Google's real certificates."""
    real = GoogleIdTokenVerifier(client_id=CLIENT_ID)

    with pytest.raises(InvalidGoogleTokenError):
        await real.verify(id_token())
