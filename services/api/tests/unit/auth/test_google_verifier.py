"""The google-auth adapter, exercised offline with our own signing key and certificate endpoint."""

import base64
import json
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from google.auth import crypt, exceptions, transport
from google.auth import jwt as google_jwt

from english_learn_api.auth.domain.errors import (
    GoogleEmailNotVerifiedError,
    GoogleUnavailableError,
    InvalidGoogleTokenError,
)
from english_learn_api.auth.domain.models import GoogleIdentity
from english_learn_api.auth.infrastructure.google_verifier import (
    GOOGLE_CERTS_URL,
    MAX_STALE_SECONDS,
    NEGATIVE_CACHE_SECONDS,
    REQUEST_TIMEOUT_SECONDS,
    CachingRequest,
    GoogleIdTokenVerifier,
)

CLIENT_ID = "test-client.apps.googleusercontent.com"
ANDROID_CLIENT_ID = "test-android.apps.googleusercontent.com"
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
    return GoogleIdTokenVerifier(
        client_ids=[CLIENT_ID, ANDROID_CLIENT_ID], request=endpoint or FakeCertsEndpoint()
    )


async def test_returns_the_identity_of_a_valid_token() -> None:
    identity = await verifier().verify(id_token())

    assert identity == GoogleIdentity(sub="1234567890", email="ana@example.com")


class TestClientIdAllowlist:
    async def test_accepts_any_allowed_audience(self) -> None:
        assert await verifier().verify(id_token(aud=ANDROID_CLIENT_ID))

    async def test_accepts_an_allowed_authorized_party(self) -> None:
        assert await verifier().verify(id_token(azp=ANDROID_CLIENT_ID))

    async def test_rejects_an_authorized_party_outside_the_allowlist(self) -> None:
        with pytest.raises(InvalidGoogleTokenError):
            await verifier().verify(id_token(azp="someone-else.apps.googleusercontent.com"))

    async def test_rejects_an_audience_outside_the_allowlist(self) -> None:
        with pytest.raises(InvalidGoogleTokenError):
            await verifier().verify(id_token(aud="someone-else.apps.googleusercontent.com"))


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


class ControlledFetcher(transport.Request):
    """A certificate endpoint whose answers and timing the test controls, per URL."""

    def __init__(self, max_age: int = 60) -> None:
        self.max_age = max_age
        self.fail: Exception | int | None = None  # an exception to raise, or a status code
        self.blocked_urls: set[str] = set()
        self.release = threading.Event()
        self.entered = threading.Event()
        self.calls: list[str] = []
        self._lock = threading.Lock()

    def __call__(self, url: str, method: str = "GET", *_: Any, **__: Any) -> transport.Response:
        with self._lock:
            self.calls.append(url)
        if url in self.blocked_urls:
            self.entered.set()
            self.release.wait(timeout=10)
        if isinstance(self.fail, Exception):
            raise self.fail
        status = self.fail if isinstance(self.fail, int) else 200
        body = json.dumps({KID: CERT_PEM}).encode()
        return FakeResponse(status, body, {"cache-control": f"max-age={self.max_age}"})


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def in_thread(call: Callable[[], object]) -> tuple[threading.Thread, list[object]]:
    results: list[object] = []

    def run() -> None:
        try:
            results.append(call())
        except Exception as error:
            results.append(error)

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return thread, results


class TestCertificateCache:
    def test_a_slow_fetch_does_not_block_other_urls(self) -> None:
        fetcher = ControlledFetcher()
        request = CachingRequest(fetcher)
        fetcher.blocked_urls.add("https://slow")
        slow, _ = in_thread(lambda: request("https://slow"))
        assert fetcher.entered.wait(timeout=5)

        fast, results = in_thread(lambda: request("https://fast"))
        fast.join(timeout=2)
        blocked = fast.is_alive()

        fetcher.release.set()
        slow.join(timeout=5)
        fast.join(timeout=5)
        assert not blocked, "the cache lock was held during the slow fetch"
        assert isinstance(results[0], FakeResponse)

    def test_concurrent_misses_share_one_fetch(self) -> None:
        fetcher = ControlledFetcher()
        request = CachingRequest(fetcher)
        fetcher.blocked_urls.add("https://certs")
        leader, _ = in_thread(lambda: request("https://certs"))
        assert fetcher.entered.wait(timeout=5)

        followers = [in_thread(lambda: request("https://certs")) for _ in range(4)]
        time.sleep(0.05)  # let the followers find the fetch in flight
        fetcher.release.set()
        for thread, _ in [*followers, (leader, [])]:
            thread.join(timeout=5)

        assert fetcher.calls == ["https://certs"]
        assert all(results[0].status == 200 for _, results in followers)  # type: ignore[attr-defined]

    def test_honors_max_age(self) -> None:
        fetcher, clock = ControlledFetcher(max_age=60), Clock()
        request = CachingRequest(fetcher, monotonic=clock)

        request("https://certs")
        clock.now += 59
        request("https://certs")
        assert len(fetcher.calls) == 1

        clock.now += 2
        request("https://certs")
        assert len(fetcher.calls) == 2

    @pytest.mark.parametrize(
        "failure",
        [500, exceptions.TransportError("connection reset")],
        ids=["error status", "transport error"],
    )
    def test_serves_stale_certificates_when_a_refetch_fails(self, failure: Exception | int) -> None:
        fetcher, clock = ControlledFetcher(max_age=60), Clock()
        request = CachingRequest(fetcher, monotonic=clock)
        fresh = request("https://certs")
        clock.now += 61
        fetcher.fail = failure

        assert request("https://certs") is fresh
        assert len(fetcher.calls) == 2

    def test_stale_certificates_expire_eventually(self) -> None:
        fetcher, clock = ControlledFetcher(max_age=60), Clock()
        request = CachingRequest(fetcher, monotonic=clock)
        request("https://certs")
        clock.now += 60 + MAX_STALE_SECONDS + 1
        fetcher.fail = 500

        assert request("https://certs").status == 500

    def test_remembers_a_failure_briefly(self) -> None:
        fetcher, clock = ControlledFetcher(), Clock()
        request = CachingRequest(fetcher, monotonic=clock)
        fetcher.fail = 503

        assert request("https://certs").status == 503
        with pytest.raises(exceptions.TransportError):
            request("https://certs")
        assert len(fetcher.calls) == 1

        clock.now += NEGATIVE_CACHE_SECONDS
        fetcher.fail = None
        assert request("https://certs").status == 200
        assert len(fetcher.calls) == 2

    def test_passes_a_timeout_to_the_transport(self) -> None:
        seen: list[object] = []

        class Recording(ControlledFetcher):
            def __call__(
                self, url: str, method: str = "GET", *args: Any, **kwargs: Any
            ) -> transport.Response:
                seen.append(kwargs.get("timeout", args[2] if len(args) > 2 else None))
                return super().__call__(url, method)

        CachingRequest(Recording())("https://certs")

        assert seen == [REQUEST_TIMEOUT_SECONDS]


async def test_verification_has_a_total_timeout() -> None:
    fetcher = ControlledFetcher()
    fetcher.blocked_urls.add(GOOGLE_CERTS_URL)
    google = GoogleIdTokenVerifier(client_ids=[CLIENT_ID], request=fetcher, total_timeout=0.2)

    started = time.monotonic()
    with pytest.raises(GoogleUnavailableError):
        await google.verify(id_token())

    assert time.monotonic() - started < 2
    fetcher.release.set()


@pytest.mark.google_network
async def test_the_real_google_endpoint_rejects_a_forged_token() -> None:
    """Opt in with RUN_GOOGLE_NETWORK_TESTS=1: fetches Google's real certificates."""
    real = GoogleIdTokenVerifier(client_ids=[CLIENT_ID])

    with pytest.raises(InvalidGoogleTokenError):
        await real.verify(id_token())
