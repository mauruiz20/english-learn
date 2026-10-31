"""The one place that decides a request's client address (rate-limit keys, any IP logging).

- `socket`: `request.client`, the TCP peer. uvicorn rewrites it from `X-Forwarded-For` only when
  the peer is in `FORWARDED_ALLOW_IPS`.
- `cf-connecting-ip`: behind a Cloudflare Tunnel every request comes from `cloudflared`, and the
  real client is in `CF-Connecting-IP`. The header is honored only when the peer is in
  `TRUSTED_PROXY_CIDRS` and it holds exactly one valid IP address; otherwise the peer is used, so
  a client that reaches the server directly cannot choose its own address.
"""

from collections.abc import Callable, Sequence
from ipaddress import IPv4Address, IPv4Network, IPv6Address, IPv6Network, ip_address

from fastapi import Request

type ClientIpResolver = Callable[[Request], str]
type IpNetwork = IPv4Network | IPv6Network

UNKNOWN_CLIENT = "unknown"
CF_CONNECTING_IP = "cf-connecting-ip"


def socket_client_ip(request: Request) -> str:
    return request.client.host if request.client else UNKNOWN_CLIENT


def cf_connecting_ip(trusted_proxies: Sequence[IpNetwork]) -> ClientIpResolver:
    trusted = tuple(trusted_proxies)

    def resolve(request: Request) -> str:
        peer = socket_client_ip(request)
        peer_address = _parse(peer)
        if peer_address is None or not any(peer_address in network for network in trusted):
            return peer
        values = request.headers.getlist(CF_CONNECTING_IP)
        client = _parse(values[0]) if len(values) == 1 else None
        return peer if client is None else str(client)

    return resolve


def _parse(value: str) -> IPv4Address | IPv6Address | None:
    try:
        address = ip_address(value)
    except ValueError:
        return None
    if isinstance(address, IPv6Address) and address.ipv4_mapped is not None:
        return address.ipv4_mapped  # "::ffff:172.18.0.5" from a dual-stack socket
    return address
