import type { components, paths } from "./generated/schema";

type Schemas = components["schemas"];
type JsonBody<T> = T extends { content: { "application/json": infer Body } } ? Body : never;
type Ok<Path extends keyof paths, Method extends keyof paths[Path]> = paths[Path][Method] extends {
  responses: { 200: infer Response };
}
  ? JsonBody<Response>
  : never;

/** Body transport: the refresh token is in the JSON. */
export type SignInResponse = Schemas["SignInResponse"];
export type TokensResponse = Schemas["TokensResponse"];
/** Cookie transport: the refresh token is only in the HttpOnly `el_rt` cookie. */
export type CookieSignInResponse = Schemas["CookieSignInResponse"];
export type CookieTokensResponse = Schemas["CookieTokensResponse"];
export type UserResponse = Ok<"/v1/me", "get">;
export type SyncRequest = Schemas["SyncRequest"];
export type SyncEvent = Schemas["EventRequest"];
export type SyncResponse = Ok<"/v1/sync", "post">;
export type SyncedEvent = Schemas["EventResponse"];

/** The subset of `fetch` the client uses, so any implementation (or a fake) fits. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    credentials?: "include";
  },
) => Promise<{
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

/**
 * How the refresh token travels (`X-Token-Transport`). `cookie` (web): an HttpOnly cookie the
 * browser keeps, out of JavaScript's reach. `body`: in the JSON, for clients that store it.
 */
export type TokenTransport = "cookie" | "body";

export type ApiClientOptions<Transport extends TokenTransport = TokenTransport> = {
  /** For example `https://english-learn-api.onrender.com`. */
  readonly baseUrl: string;
  /** The current access token, or null when signed out (protected calls then get a 401). */
  readonly getAccessToken: () => string | null | Promise<string | null>;
  /** Defaults to `"cookie"`, the web app's transport. */
  readonly tokenTransport?: Transport;
  /** Defaults to the global `fetch`. */
  readonly fetch?: FetchLike;
};

/** A non-2xx answer. `code` is the API's stable error code (`device_conflict`, `rate_limited`…). */
export class ApiError extends Error {
  override readonly name = "ApiError";

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** From `Retry-After` (429), else null. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }
}

/** The web client: the browser sends and stores the refresh cookie. */
export type CookieAuth = {
  /**
   * Sets the refresh cookie; the JSON has the access token and the user. `nonce` is the one the
   * app put in the Google authorization request: the API requires it in cookie mode and checks it
   * against the ID token's `nonce` claim.
   */
  signInWithGoogle(idToken: string, nonce: string): Promise<CookieSignInResponse>;
  /** Rotates the refresh cookie. Serialize calls across tabs (see services/api/README.md). */
  refresh(): Promise<CookieTokensResponse>;
  /** Revokes the session and clears the refresh cookie. */
  logout(): Promise<void>;
};

/** Clients that store the refresh token themselves. */
export type BodyAuth = {
  /** `nonce`, when given, must equal the ID token's `nonce` claim. */
  signInWithGoogle(idToken: string, nonce?: string): Promise<SignInResponse>;
  /** Rotates the refresh token. Serialize calls (see services/api/README.md). */
  refresh(refreshToken: string): Promise<TokensResponse>;
  logout(refreshToken: string): Promise<void>;
};

export type ApiClient<Transport extends TokenTransport = "cookie"> = (Transport extends "body"
  ? BodyAuth
  : CookieAuth) & {
  me(): Promise<UserResponse>;
  /** Needs a Google sign-in less than 5 minutes old, else 401 `reauthentication_required`. */
  deleteAccount(): Promise<void>;
  /** Uploads events and downloads the account's events after `cursor`; repeat while `hasMore`. */
  sync(request: SyncRequest): Promise<SyncResponse>;
};

/** What the implementation builds; the overloads narrow it to one transport's methods. */
type AnyApiClient = Omit<ApiClient, keyof CookieAuth> & {
  signInWithGoogle(idToken: string, nonce?: string): Promise<SignInResponse | CookieSignInResponse>;
  refresh(refreshToken?: string): Promise<TokensResponse | CookieTokensResponse>;
  logout(refreshToken?: string): Promise<void>;
};

type Call = {
  method: "GET" | "POST" | "DELETE";
  path: keyof paths;
  body?: unknown;
  /** Sends the bearer access token. */
  auth?: boolean;
  /** An auth endpoint: sends the token transport (and, in cookie mode, credentials). */
  session?: boolean;
};

export function createApiClient(options: ApiClientOptions<"cookie">): ApiClient<"cookie">;
export function createApiClient(
  options: ApiClientOptions<"body"> & { readonly tokenTransport: "body" },
): ApiClient<"body">;
export function createApiClient(options: ApiClientOptions): AnyApiClient {
  const transport = options.tokenTransport ?? "cookie";
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  // Called through a wrapper: browsers reject `fetch` invoked with another `this`.
  const fetch: FetchLike = options.fetch ?? ((url, init) => globalThis.fetch(url, init));

  async function send(request: Call): Promise<string> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (request.body !== undefined) headers["Content-Type"] = "application/json";
    if (request.auth) {
      const token = await options.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const cookie = request.session === true && transport === "cookie";
    if (request.session) headers["X-Token-Transport"] = transport;
    // CSRF defense for cookie-authenticated calls; the API checks it with the Origin.
    if (cookie) headers["X-Requested-With"] = "english-learn";
    const response = await fetch(`${baseUrl}${request.path}`, {
      method: request.method,
      headers,
      ...(cookie ? { credentials: "include" as const } : {}),
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
    const text = await response.text();
    if (!response.ok) throw toApiError(response.status, text, response.headers.get("Retry-After"));
    return text;
  }

  async function json<T>(request: Call): Promise<T> {
    return JSON.parse(await send(request)) as T;
  }

  async function empty(request: Call): Promise<void> {
    await send(request);
  }

  // In cookie mode `refreshToken` is undefined, so no body is sent: the browser sends the cookie.
  const session = (path: keyof paths, refreshToken?: string): Call => ({
    method: "POST",
    path,
    session: true,
    ...(refreshToken === undefined ? {} : { body: { refreshToken } }),
  });

  return {
    signInWithGoogle: (idToken, nonce) =>
      json({
        method: "POST",
        path: "/v1/auth/google",
        body: nonce === undefined ? { idToken } : { idToken, nonce },
        session: true,
      }),
    refresh: (refreshToken) => json(session("/v1/auth/refresh", refreshToken)),
    logout: (refreshToken) => empty(session("/v1/auth/logout", refreshToken)),
    me: () => json({ method: "GET", path: "/v1/me", auth: true }),
    deleteAccount: () => empty({ method: "DELETE", path: "/v1/account", auth: true }),
    sync: (request) => json({ method: "POST", path: "/v1/sync", body: request, auth: true }),
  };
}

function toApiError(status: number, text: string, retryAfter: string | null): ApiError {
  const seconds = retryAfter !== null && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null;
  const error = parseError(text);
  return error
    ? new ApiError(status, error.code, error.message, seconds)
    : new ApiError(status, `http_${status}`, `HTTP ${status}`, seconds);
}

function parseError(text: string): { code: string; message: string } | null {
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body !== "object" || body === null || !("error" in body)) return null;
    const { error } = body;
    if (typeof error !== "object" || error === null) return null;
    const code = "code" in error ? error.code : undefined;
    const message = "message" in error ? error.message : undefined;
    return typeof code === "string" && typeof message === "string" ? { code, message } : null;
  } catch {
    return null;
  }
}
