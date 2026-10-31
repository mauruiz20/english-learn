import type { RandomBytes } from "@/features/progress/progress-events";

/**
 * Google sign-in on the web with the OpenID Connect implicit redirect flow. The page runs
 * cross-origin isolated (COOP `same-origin`, COEP `require-corp`, for expo-sqlite), so Google
 * Identity Services' script, iframe and popups cannot work; a full-page redirect does:
 *
 * 1. Generate `state` and `nonce`, keep them in `sessionStorage` (this tab only), and navigate to
 *    Google's authorization endpoint with `response_type=id_token`.
 * 2. Google redirects to `<origin>/auth/callback#id_token=…&state=…`. The fragment never reaches
 *    a server or the service worker.
 * 3. The callback checks `state`, removes the fragment from history and sends
 *    `{ idToken, nonce }` to the API, which checks the token's `nonce` claim.
 */

/** The web OAuth client (public). */
export const GOOGLE_CLIENT_ID =
  "78200832989-odkefhj0s4vla7h5p83gevs2440mctev.apps.googleusercontent.com";

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const CALLBACK_PATH = "/auth/callback";

/** What happens after Google sends the learner back. */
export type AuthIntent = "sign-in" | "delete-account";

export type PendingSignIn = {
  readonly state: string;
  readonly nonce: string;
  /** In-app path to go back to (e.g. "/cuenta"). */
  readonly returnTo: string;
  readonly intent: AuthIntent;
  /** Epoch ms. */
  readonly createdAt: number;
  /** For a re-authentication: the account that asked (the learner must pick the same one). */
  readonly accountId?: string;
};

export function googleAuthorizationUrl(request: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const params = new URLSearchParams({
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    response_type: "id_token",
    scope: "openid email profile",
    nonce: request.nonce,
    state: request.state,
    prompt: "select_account",
  });
  return `${AUTHORIZATION_ENDPOINT}?${params.toString()}`;
}

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += BASE64URL[(n >> 18) & 63]! + BASE64URL[(n >> 12) & 63]!;
    if (b !== undefined) out += BASE64URL[(n >> 6) & 63]!;
    if (c !== undefined) out += BASE64URL[n & 63]!;
  }
  return out;
}

/** 256 random bits as base64url: unguessable `state` and `nonce` values. */
export function randomToken(randomBytes: RandomBytes): string {
  return base64url(randomBytes(32));
}

export type CallbackResult =
  | { readonly kind: "token"; readonly idToken: string; readonly state: string }
  | { readonly kind: "error"; readonly error: string; readonly state: string }
  | { readonly kind: "invalid" };

/** Parses the callback URL's fragment (`#id_token=…&state=…` or `#error=…&state=…`). */
export function parseCallbackFragment(hash: string): CallbackResult {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const state = params.get("state");
  if (!state) return { kind: "invalid" };
  const error = params.get("error");
  if (error) return { kind: "error", error, state };
  const idToken = params.get("id_token");
  if (!idToken) return { kind: "invalid" };
  return { kind: "token", idToken, state };
}

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PENDING_KEY = "english-learn.pending-sign-in";
/** A sign-in not completed within this time must start again. */
const PENDING_TTL_MS = 10 * 60_000;

/** Only same-app paths: never an absolute URL or a protocol-relative one (`//host`). */
function safeReturnPath(path: unknown): string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//")
    ? path
    : "/cuenta";
}

function parsePending(value: string | null): PendingSignIn | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PendingSignIn> | null;
    if (
      typeof parsed?.state !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.createdAt !== "number" ||
      (parsed.intent !== "sign-in" && parsed.intent !== "delete-account")
    ) {
      return null;
    }
    return {
      state: parsed.state,
      nonce: parsed.nonce,
      createdAt: parsed.createdAt,
      intent: parsed.intent,
      returnTo: safeReturnPath(parsed.returnTo),
      ...(typeof parsed.accountId === "string" ? { accountId: parsed.accountId } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * The sign-in in progress, kept in `sessionStorage` (per tab, gone when it closes). `take` hands
 * it back once, only for the matching `state` and while fresh, and always forgets it.
 */
export function createPendingSignInStore(storage: KeyValueStorage, now: () => number = Date.now) {
  return {
    save(pending: PendingSignIn): void {
      storage.setItem(PENDING_KEY, JSON.stringify(pending));
    },
    take(state: string): PendingSignIn | null {
      const pending = parsePending(storage.getItem(PENDING_KEY));
      storage.removeItem(PENDING_KEY);
      if (pending === null || pending.state !== state) return null;
      if (now() - pending.createdAt > PENDING_TTL_MS) return null;
      return pending;
    },
  };
}

export type PendingSignInStore = ReturnType<typeof createPendingSignInStore>;
