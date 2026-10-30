import type { components, paths } from "./generated/schema";

type Schemas = components["schemas"];
type JsonBody<T> = T extends { content: { "application/json": infer Body } } ? Body : never;
type Ok<Path extends keyof paths, Method extends keyof paths[Path]> = paths[Path][Method] extends {
  responses: { 200: infer Response };
}
  ? JsonBody<Response>
  : never;

export type SignInResponse = Ok<"/v1/auth/google", "post">;
export type TokensResponse = Ok<"/v1/auth/refresh", "post">;
export type UserResponse = Ok<"/v1/me", "get">;
export type SyncRequest = Schemas["SyncRequest"];
export type SyncEvent = Schemas["EventRequest"];
export type SyncResponse = Ok<"/v1/sync", "post">;
export type SyncedEvent = Schemas["EventResponse"];

/** The subset of `fetch` the client uses, so any implementation (or a fake) fits. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export type ApiClientOptions = {
  /** For example `https://english-learn-api.onrender.com`. */
  readonly baseUrl: string;
  /** The current access token, or null when signed out (protected calls then get a 401). */
  readonly getAccessToken: () => string | null | Promise<string | null>;
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

export type ApiClient = {
  signInWithGoogle(idToken: string): Promise<SignInResponse>;
  /** Rotates the refresh token. Serialize calls across tabs (see services/api/README.md). */
  refresh(refreshToken: string): Promise<TokensResponse>;
  logout(refreshToken: string): Promise<void>;
  me(): Promise<UserResponse>;
  /** Needs a Google sign-in less than 5 minutes old, else 401 `reauthentication_required`. */
  deleteAccount(): Promise<void>;
  /** Uploads events and downloads the account's events after `cursor`; repeat while `hasMore`. */
  sync(request: SyncRequest): Promise<SyncResponse>;
};

type Call = { method: "GET" | "POST" | "DELETE"; path: keyof paths; body?: unknown; auth: boolean };

export function createApiClient(options: ApiClientOptions): ApiClient {
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
    const response = await fetch(`${baseUrl}${request.path}`, {
      method: request.method,
      headers,
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

  return {
    signInWithGoogle: (idToken) =>
      json({ method: "POST", path: "/v1/auth/google", body: { idToken }, auth: false }),
    refresh: (refreshToken) =>
      json({ method: "POST", path: "/v1/auth/refresh", body: { refreshToken }, auth: false }),
    logout: (refreshToken) =>
      empty({ method: "POST", path: "/v1/auth/logout", body: { refreshToken }, auth: false }),
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
