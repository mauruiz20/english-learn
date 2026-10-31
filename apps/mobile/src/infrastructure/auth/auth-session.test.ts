import { ApiError } from "@english-learn/api-client";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createAuthSession, type AuthApi } from "./auth-session";

const ACCOUNT = { userId: "user-1", email: "ana@example.com" };
const NOW = Date.parse("2026-10-30T12:00:00Z");
const LATER = "2026-10-30T12:15:00Z";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeApi(overrides: Partial<AuthApi> = {}): AuthApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    signInWithGoogle: jest.fn(async (idToken: string, nonce: string) => {
      calls.push(`google:${idToken}:${nonce}`);
      return {
        accessToken: "access-1",
        accessTokenExpiresAt: LATER,
        user: { id: ACCOUNT.userId, email: ACCOUNT.email },
      };
    }),
    refresh: jest.fn(async () => {
      calls.push("refresh");
      return { accessToken: `access-r${calls.length}`, accessTokenExpiresAt: LATER };
    }),
    logout: jest.fn(async () => {
      calls.push("logout");
    }),
    ...overrides,
  };
}

function setup(options: { api?: AuthApi; signedIn?: boolean; now?: () => number } = {}) {
  const api = options.api ?? fakeApi();
  const settings = createFakeSettingsRepository({
    account: options.signedIn ? ACCOUNT : null,
  });
  const lockNames: string[] = [];
  const session = createAuthSession({
    api,
    settings,
    now: options.now ?? (() => NOW),
    lock: async (name, task) => {
      lockNames.push(name);
      return task();
    },
  });
  return { api, settings, session, lockNames };
}

const unauthorized = (code: string) => new ApiError(401, code, code);

describe("createAuthSession", () => {
  it("starts signed out and stays so on restore without a marker, with no network call", async () => {
    const { session, api } = setup();

    await session.restore();

    expect(session.getState()).toEqual({ status: "signed-out" });
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it("signs in: access token in memory, only id and email stored", async () => {
    const { session, settings, api } = setup();

    await session.signIn("id-token", "nonce-1");

    expect(api.signInWithGoogle).toHaveBeenCalledWith("id-token", "nonce-1");
    expect(session.getState()).toEqual({ status: "signed-in", account: ACCOUNT });
    expect(session.accessToken()).toBe("access-1");
    expect(settings.account()).toEqual(ACCOUNT);
  });

  it("restores a remembered session with the refresh cookie", async () => {
    const { session, lockNames } = setup({ signedIn: true });

    await session.restore();

    expect(session.getState()).toEqual({ status: "signed-in", account: ACCOUNT });
    expect(session.accessToken()).toMatch(/^access-r/);
    expect(lockNames).toEqual(["english-learn-refresh"]);
  });

  it("signs out when the cookie is no longer valid (401)", async () => {
    const api = fakeApi({
      refresh: jest.fn(async () => {
        throw unauthorized("invalid_refresh_token");
      }),
    });
    const { session, settings } = setup({ api, signedIn: true });

    await session.restore();

    expect(session.getState()).toEqual({ status: "signed-out" });
    expect(settings.account()).toBeNull();
  });

  it("stays signed in while offline: the session is restored later", async () => {
    const api = fakeApi({
      refresh: jest.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    const { session, settings } = setup({ api, signedIn: true });

    await session.restore();

    expect(session.getState()).toEqual({ status: "signed-in", account: ACCOUNT });
    expect(session.accessToken()).toBeNull();
    expect(settings.account()).toEqual(ACCOUNT);
  });

  it("runs one refresh at a time: concurrent callers share it", async () => {
    const pending = deferred<{ accessToken: string; accessTokenExpiresAt: string }>();
    const api = fakeApi({ refresh: jest.fn(() => pending.promise) });
    const { session } = setup({ api, signedIn: true });

    const first = session.refresh();
    const second = session.refresh();
    pending.resolve({ accessToken: "fresh", accessTokenExpiresAt: LATER });

    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(session.accessToken()).toBe("fresh");
  });

  it("ignores a restore that finishes after a newer sign-in", async () => {
    const pending = deferred<{ accessToken: string; accessTokenExpiresAt: string }>();
    const api = fakeApi({ refresh: jest.fn(() => pending.promise) });
    const { session, settings } = setup({ api, signedIn: true });

    const restoring = session.restore();
    await session.signIn("id-token", "nonce-1");
    pending.reject(unauthorized("invalid_refresh_token"));
    await restoring;

    expect(session.getState()).toEqual({ status: "signed-in", account: ACCOUNT });
    expect(settings.account()).toEqual(ACCOUNT);
  });

  describe("authorized calls", () => {
    it("refreshes an expired access token first", async () => {
      let now = NOW;
      const { session, api } = setup({ now: () => now });
      await session.signIn("id-token", "nonce-1");
      now = Date.parse(LATER) + 1;

      const token = await session.authorized(async (accessToken) => accessToken);

      expect(api.refresh).toHaveBeenCalledTimes(1);
      expect(token).toMatch(/^access-r/);
    });

    it("refreshes once and retries after a 401 invalid_token", async () => {
      const { session } = setup();
      await session.signIn("id-token", "nonce-1");
      const call = jest
        .fn<Promise<string>, [string | null]>()
        .mockRejectedValueOnce(unauthorized("invalid_token"))
        .mockResolvedValueOnce("ok");

      expect(await session.authorized(call)).toBe("ok");
      expect(call).toHaveBeenCalledTimes(2);
    });

    it("passes reauthentication_required through untouched", async () => {
      const { session, api } = setup();
      await session.signIn("id-token", "nonce-1");

      await expect(
        session.authorized(async () => {
          throw unauthorized("reauthentication_required");
        }),
      ).rejects.toMatchObject({ code: "reauthentication_required" });
      expect(api.refresh).not.toHaveBeenCalled();
    });
  });

  it("signs out: revokes the session on the server and forgets it here", async () => {
    const { session, settings, api } = setup();
    await session.signIn("id-token", "nonce-1");

    await session.signOut();

    expect(api.logout).toHaveBeenCalled();
    expect(session.getState()).toEqual({ status: "signed-out" });
    expect(session.accessToken()).toBeNull();
    expect(settings.account()).toBeNull();
  });

  it("signs out locally even when the server cannot be reached", async () => {
    const api = fakeApi({
      logout: jest.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    const { session } = setup({ api });
    await session.signIn("id-token", "nonce-1");

    await session.signOut();

    expect(session.getState()).toEqual({ status: "signed-out" });
  });

  it("notifies subscribers of state changes", async () => {
    const { session } = setup();
    const seen: string[] = [];
    session.subscribe(() => seen.push(session.getState().status));

    await session.signIn("id-token", "nonce-1");
    session.forget();

    expect(seen).toEqual(["signed-in", "signed-out"]);
  });
});
