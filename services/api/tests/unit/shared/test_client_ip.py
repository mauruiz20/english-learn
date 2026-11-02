"""Which address identifies the client: the TCP peer, or Cloudflare's header from a trusted peer."""

from ipaddress import ip_network

import pytest
from starlette.requests import Request

from english_learn_api.shared.client_ip import cf_connecting_ip, rate_limit_key, socket_client_ip

PROXY = "172.18.0.5"  # cloudflared on the compose network
TRUSTED = (ip_network("172.18.0.0/16"), ip_network("fd00:18::/64"))


def request(peer: str | None, *headers: tuple[str, str]) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [(name.lower().encode(), value.encode()) for name, value in headers],
            "client": None if peer is None else (peer, 50000),
        }
    )


class TestSocket:
    def test_uses_the_peer(self) -> None:
        assert socket_client_ip(request("203.0.113.9")) == "203.0.113.9"

    def test_ignores_cloudflare_header(self) -> None:
        sent = request(PROXY, ("CF-Connecting-IP", "198.51.100.7"))

        assert socket_client_ip(sent) == PROXY

    def test_without_a_peer(self) -> None:
        assert socket_client_ip(request(None)) == "unknown"


class TestCfConnectingIp:
    resolve = staticmethod(cf_connecting_ip(TRUSTED))

    def test_honors_the_header_from_a_trusted_peer(self) -> None:
        assert self.resolve(request(PROXY, ("CF-Connecting-IP", "198.51.100.7"))) == "198.51.100.7"

    def test_ignores_the_header_from_an_untrusted_peer(self) -> None:
        sent = request("203.0.113.9", ("CF-Connecting-IP", "198.51.100.7"))

        assert self.resolve(sent) == "203.0.113.9"

    def test_uses_the_peer_when_the_header_is_missing(self) -> None:
        assert self.resolve(request(PROXY)) == PROXY

    @pytest.mark.parametrize(
        "value",
        ["", "not-an-ip", "198.51.100.7, 203.0.113.9", "198.51.100.7:443", "999.1.1.1", " "],
    )
    def test_ignores_a_malformed_header(self, value: str) -> None:
        assert self.resolve(request(PROXY, ("CF-Connecting-IP", value))) == PROXY

    def test_ignores_a_repeated_header(self) -> None:
        sent = request(
            PROXY, ("CF-Connecting-IP", "198.51.100.7"), ("CF-Connecting-IP", "198.51.100.8")
        )

        assert self.resolve(sent) == PROXY

    def test_ipv6_client_is_normalized(self) -> None:
        sent = request(PROXY, ("CF-Connecting-IP", "2001:DB8:0::0:1"))

        assert self.resolve(sent) == "2001:db8::1"

    def test_ipv6_peer_in_a_trusted_range(self) -> None:
        sent = request("fd00:18::5", ("CF-Connecting-IP", "198.51.100.7"))

        assert self.resolve(sent) == "198.51.100.7"

    def test_ipv4_mapped_peer_counts_as_its_ipv4_address(self) -> None:
        sent = request("::ffff:172.18.0.5", ("CF-Connecting-IP", "198.51.100.7"))

        assert self.resolve(sent) == "198.51.100.7"

    def test_without_a_peer(self) -> None:
        assert self.resolve(request(None, ("CF-Connecting-IP", "198.51.100.7"))) == "unknown"

    def test_a_non_ip_peer_is_not_trusted(self) -> None:
        sent = request("testclient", ("CF-Connecting-IP", "198.51.100.7"))

        assert self.resolve(sent) == "testclient"


class TestRateLimitKey:
    def test_an_ipv4_address_is_its_own_key(self) -> None:
        assert rate_limit_key("203.0.113.9") == "203.0.113.9"
        assert rate_limit_key("203.0.113.10") == "203.0.113.10"

    def test_ipv6_addresses_key_on_their_64_prefix(self) -> None:
        # One subscriber usually gets a whole /64: rotating inside it must not reset the limit.
        assert rate_limit_key("2001:db8:1:2:aaaa::1") == "2001:db8:1:2::/64"
        assert rate_limit_key("2001:DB8:1:2:ffff:ffff:ffff:ffff") == "2001:db8:1:2::/64"
        assert rate_limit_key("2001:db8:1:3::1") == "2001:db8:1:3::/64"

    def test_an_unparsable_value_is_kept(self) -> None:
        assert rate_limit_key("unknown") == "unknown"
