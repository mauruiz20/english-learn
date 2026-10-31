import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ApiError,
  createApiClient,
  type CookieSignInResponse,
  type CookieTokensResponse,
  type FetchLike,
  type SignInResponse,
  type SyncRequest,
  type TokensResponse,
} from "./index";

type Call = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  credentials?: "include";
};

/** Records every request and answers with the queued responses, in order. */
function fakeFetch(
  ...responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>
) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, ...init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    const headers = new Map(
      Object.entries(next.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const text = next.body === undefined ? "" : JSON.stringify(next.body);
    return {
      status: next.status,
      ok: next.status >= 200 && next.status < 300,
      headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
      text: async () => text,
    };
  };
  return { fetch, calls };
}

const TOKENS = {
  accessToken: "access",
  accessTokenExpiresAt: "2026-10-30T12:15:00Z",
  refreshToken: "refresh-2",
};
const COOKIE_TOKENS = { accessToken: "access", accessTokenExpiresAt: "2026-10-30T12:15:00Z" };
const COOKIE_HEADERS = { "X-Token-Transport": "cookie", "X-Requested-With": "english-learn" };
const USER = { id: "019a3456-7890-7abc-8def-0123456789ab", email: "ana@example.com" };

function client(fetch: FetchLike, accessToken: string | null = "access-1") {
  return createApiClient({
    baseUrl: "https://api.example.com/",
    getAccessToken: () => accessToken,
    fetch,
  });
}

describe("createApiClient", () => {
  it("signs in with a Google ID token, without a bearer token", async () => {
    const { fetch, calls } = fakeFetch({ status: 200, body: { ...COOKIE_TOKENS, user: USER } });

    const signedIn = await client(fetch).signInWithGoogle("google-id-token");

    expect(signedIn).toEqual({ ...COOKIE_TOKENS, user: USER });
    expect(calls).toEqual([
      {
        url: "https://api.example.com/v1/auth/google",
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...COOKIE_HEADERS,
        },
        body: JSON.stringify({ idToken: "google-id-token" }),
      },
    ]);
  });

  it("uses the cookie transport by default: refresh and logout send no token", async () => {
    const { fetch, calls } = fakeFetch({ status: 200, body: COOKIE_TOKENS }, { status: 204 });
    const api = client(fetch);

    const tokens = await api.refresh();
    const loggedOut = await api.logout();

    expect(tokens).toEqual(COOKIE_TOKENS);
    expect(loggedOut).toBeUndefined();
    expect(calls).toEqual([
      {
        url: "https://api.example.com/v1/auth/refresh",
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", ...COOKIE_HEADERS },
      },
      {
        url: "https://api.example.com/v1/auth/logout",
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", ...COOKIE_HEADERS },
      },
    ]);
  });

  it("keeps credentials and the transport headers off the other routes", async () => {
    const { fetch, calls } = fakeFetch({ status: 200, body: USER });

    await client(fetch).me();

    expect(calls[0]).not.toHaveProperty("credentials");
    expect(calls[0]?.headers).not.toHaveProperty("X-Token-Transport");
    expect(calls[0]?.headers).not.toHaveProperty("X-Requested-With");
  });

  it("body transport: refreshes and logs out with the refresh token in the body", async () => {
    const { fetch, calls } = fakeFetch(
      { status: 200, body: { ...TOKENS, user: USER } },
      { status: 200, body: TOKENS },
      { status: 204 },
    );
    const api = createApiClient({
      baseUrl: "https://api.example.com/",
      getAccessToken: () => null,
      tokenTransport: "body",
      fetch,
    });

    const signedIn = await api.signInWithGoogle("google-id-token");
    const tokens = await api.refresh("refresh-1");
    const loggedOut = await api.logout("refresh-2");

    expect(signedIn.refreshToken).toBe("refresh-2");
    expect(tokens).toEqual(TOKENS);
    expect(loggedOut).toBeUndefined();
    const bodies = [
      '{"idToken":"google-id-token"}',
      '{"refreshToken":"refresh-1"}',
      '{"refreshToken":"refresh-2"}',
    ];
    expect(calls).toEqual(
      ["google", "refresh", "logout"].map((path, i) => ({
        url: `https://api.example.com/v1/auth/${path}`,
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Token-Transport": "body",
        },
        body: bodies[i],
      })),
    );
  });

  it("types each transport's methods", () => {
    const { fetch } = fakeFetch();
    const cookie = client(fetch);
    const body = createApiClient({
      baseUrl: "https://api.example.com",
      getAccessToken: () => null,
      tokenTransport: "body",
      fetch,
    });

    expectTypeOf(cookie.refresh).parameters.toEqualTypeOf<[]>();
    expectTypeOf(cookie.refresh).returns.resolves.toEqualTypeOf<CookieTokensResponse>();
    expectTypeOf(cookie.signInWithGoogle).returns.resolves.toEqualTypeOf<CookieSignInResponse>();
    expectTypeOf(body.refresh).parameters.toEqualTypeOf<[refreshToken: string]>();
    expectTypeOf(body.refresh).returns.resolves.toEqualTypeOf<TokensResponse>();
    expectTypeOf(body.logout).parameters.toEqualTypeOf<[refreshToken: string]>();
    expectTypeOf(body.signInWithGoogle).returns.resolves.toEqualTypeOf<SignInResponse>();
  });

  it("sends the current access token to protected routes", async () => {
    const { fetch, calls } = fakeFetch({ status: 200, body: USER }, { status: 204 });
    let token = "access-1";
    const api = createApiClient({
      baseUrl: "https://api.example.com",
      getAccessToken: async () => token,
      fetch,
    });

    expect(await api.me()).toEqual(USER);
    token = "access-2";
    expect(await api.deleteAccount()).toBeUndefined();

    expect(calls.map((c) => [c.method, c.url, c.headers.Authorization, c.body])).toEqual([
      ["GET", "https://api.example.com/v1/me", "Bearer access-1", undefined],
      ["DELETE", "https://api.example.com/v1/account", "Bearer access-2", undefined],
    ]);
  });

  it("syncs: posts the upload and returns the page", async () => {
    const page = {
      events: [
        {
          id: "019a3456-7890-7abc-8def-0123456789ab",
          deviceId: "6f1c2a4e-0b1d-4c2e-9f3a-5b6c7d8e9f01",
          occurredAt: 1793361600000,
          localDate: "2026-10-30",
          type: "item_reviewed",
          payload: { v: 1 },
        },
      ],
      cursor: 7,
      hasMore: false,
      accepted: 1,
      duplicates: 0,
      conflicts: [],
    };
    const { fetch, calls } = fakeFetch({ status: 200, body: page });
    const upload: SyncRequest = {
      deviceId: "6f1c2a4e-0b1d-4c2e-9f3a-5b6c7d8e9f01",
      cursor: null,
      events: [
        {
          id: "019a3456-7890-7abc-8def-0123456789ab",
          occurredAt: 1793361600000,
          localDate: "2026-10-30",
          type: "item_reviewed",
          payload: { v: 1 },
        },
      ],
    };

    expect(await client(fetch).sync(upload)).toEqual(page);
    expect(calls[0]).toMatchObject({
      url: "https://api.example.com/v1/sync",
      method: "POST",
      headers: { Authorization: "Bearer access-1", "Content-Type": "application/json" },
    });
    expect(JSON.parse(calls[0]?.body ?? "")).toEqual(upload);
  });

  it("omits the Authorization header when there is no access token", async () => {
    const { fetch, calls } = fakeFetch({
      status: 401,
      body: { error: { code: "unauthorized", message: "Missing bearer token" } },
    });

    await expect(client(fetch, null).me()).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });
    expect(calls[0]?.headers).not.toHaveProperty("Authorization");
  });

  it("turns error bodies into an ApiError with the server's code and message", async () => {
    const { fetch } = fakeFetch({
      status: 409,
      body: { error: { code: "device_conflict", message: "generate a new one" } },
    });

    const error = await client(fetch)
      .sync({ deviceId: "x", cursor: null, events: [] })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      name: "ApiError",
      status: 409,
      code: "device_conflict",
      message: "generate a new one",
      retryAfterSeconds: null,
    });
  });

  it("exposes Retry-After on 429", async () => {
    const { fetch } = fakeFetch({
      status: 429,
      headers: { "Retry-After": "12" },
      body: { error: { code: "rate_limited", message: "Too many requests" } },
    });

    await expect(client(fetch).refresh()).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      retryAfterSeconds: 12,
    });
  });

  it("still throws an ApiError when the error body is not the API's shape", async () => {
    const { fetch } = fakeFetch({ status: 502, body: "<html>Bad gateway</html>" });

    await expect(client(fetch).me()).rejects.toMatchObject({
      status: 502,
      code: "http_502",
    });
  });

  it("uses the global fetch when none is given", () => {
    expect(() =>
      createApiClient({ baseUrl: "https://api.example.com", getAccessToken: () => null }),
    ).not.toThrow();
  });
});
