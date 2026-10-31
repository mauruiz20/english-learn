import { ApiError, type CookieAuth } from "@english-learn/api-client";
import type { AccountMarker, SettingsRepository } from "@english-learn/domain";

/** The cookie-mode auth calls the session needs (see `@english-learn/api-client`). */
export type AuthApi = CookieAuth;

export type SessionState =
  | { readonly status: "signed-out" }
  | { readonly status: "signed-in"; readonly account: AccountMarker };

/** Runs `task` while holding the named lock (Web Locks across tabs, when available). */
export type Lock = <T>(name: string, task: () => Promise<T>) => Promise<T>;

export const REFRESH_LOCK = "english-learn-refresh";
/** Refresh a little before the access token expires, not after a request fails. */
const EXPIRY_MARGIN_MS = 30_000;

/** 401 codes that a refresh can fix; any other 401 (e.g. reauthentication) is the caller's. */
const REFRESHABLE = new Set(["invalid_token", "unauthorized"]);

/** `navigator.locks` when the browser has it; otherwise the task runs as is. */
export const webLock: Lock = (name, task) => {
  const locks = (globalThis.navigator as { locks?: LockManager } | undefined)?.locks;
  return locks ? (locks.request(name, task) as Promise<Awaited<ReturnType<typeof task>>>) : task();
};

const isUnauthorized = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 401;

/**
 * The web session. The refresh token lives in an HttpOnly cookie the browser keeps; the access
 * token lives in memory only; the device remembers only who is signed in (`AccountMarker`), so a
 * restart restores the session with one refresh.
 *
 * - Refreshes are single-flight in the tab and serialized across tabs with a Web Lock, because
 *   concurrent rotations of one cookie would end the session (see services/api/README.md).
 * - A refresh answered 401 ends the session (marker cleared). A network failure does not: the
 *   learner stays signed in and the next refresh retries.
 * - Every sign-in or sign-out bumps a generation, so a slow restore cannot undo a newer change.
 */
export function createAuthSession({
  api,
  settings,
  now = Date.now,
  lock = webLock,
}: {
  api: AuthApi;
  settings: Pick<SettingsRepository, "getAccount" | "setAccount" | "clearAccount">;
  now?: () => number;
  lock?: Lock;
}) {
  let state: SessionState = { status: "signed-out" };
  let token: { value: string; expiresAt: number } | null = null;
  let generation = 0;
  let inFlight: Promise<boolean> | null = null;
  const listeners = new Set<() => void>();

  const setState = (next: SessionState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const setToken = (accessToken: string, expiresAt: string) => {
    token = { value: accessToken, expiresAt: Date.parse(expiresAt) };
  };

  /** Local only: the server session is gone or never was. */
  const forget = () => {
    generation += 1;
    token = null;
    void settings.clearAccount().catch((error: unknown) => {
      console.error("Failed to forget the account", error);
    });
    if (state.status !== "signed-out") setState({ status: "signed-out" });
  };

  const refresh = (): Promise<boolean> => {
    if (inFlight !== null) return inFlight;
    const started = generation;
    inFlight = lock(REFRESH_LOCK, () => api.refresh())
      .then(
        (tokens) => {
          if (started !== generation) return false;
          setToken(tokens.accessToken, tokens.accessTokenExpiresAt);
          return true;
        },
        (error: unknown) => {
          if (started === generation && isUnauthorized(error)) forget();
          if (!isUnauthorized(error)) throw error;
          return false;
        },
      )
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const fresh = () => token !== null && token.expiresAt - EXPIRY_MARGIN_MS > now();

  return {
    getState: () => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** The current access token, or null (signed out, or not refreshed yet). */
    accessToken: () => token?.value ?? null,

    /** On app start: with a remembered account, get an access token from the refresh cookie. */
    async restore(): Promise<void> {
      const started = generation;
      const account = await settings.getAccount();
      if (account === null || started !== generation) return;
      setState({ status: "signed-in", account });
      try {
        await refresh();
      } catch (error) {
        // Offline or the API is down: stay signed in; a later refresh tries again.
        console.warn("Could not restore the session yet", error);
      }
    },

    async signIn(idToken: string, nonce: string): Promise<AccountMarker> {
      const signedIn = await api.signInWithGoogle(idToken, nonce);
      generation += 1;
      const account = { userId: signedIn.user.id, email: signedIn.user.email };
      setToken(signedIn.accessToken, signedIn.accessTokenExpiresAt);
      await settings.setAccount(account);
      setState({ status: "signed-in", account });
      return account;
    },

    /** True when a new access token was obtained; false when the session ended. */
    refresh,

    /**
     * Runs a protected call with a fresh access token: refreshes first when it is missing or
     * about to expire, and once more after a 401 `invalid_token`.
     */
    async authorized<T>(call: (accessToken: string | null) => Promise<T>): Promise<T> {
      if (!fresh()) await refresh();
      try {
        return await call(token?.value ?? null);
      } catch (error) {
        if (!isUnauthorized(error) || !REFRESHABLE.has(error.code)) throw error;
        if (!(await refresh())) throw error;
        return call(token?.value ?? null);
      }
    },

    /**
     * Revokes the session on the server (best effort) and forgets it on this device; reports
     * signed out once the account marker is gone, so a reload right after does not restore it.
     */
    async signOut(): Promise<void> {
      try {
        await api.logout();
      } catch (error) {
        console.warn("Could not revoke the session on the server", error);
      }
      generation += 1;
      token = null;
      await settings.clearAccount().catch((error: unknown) => {
        console.error("Failed to forget the account", error);
      });
      forget();
    },

    forget,
  };
}

export type AuthSession = ReturnType<typeof createAuthSession>;
