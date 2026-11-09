import { ApiError, createApiClient, type SyncResponse } from "@english-learn/api-client";
import { createHash } from "node:crypto";
import { localDate, type StoredEvent } from "@english-learn/domain";
import { createChangeSignal } from "@/infrastructure/sync/sync-triggers";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSyncStore } from "@/testing/fake-sync-store";
import { createTestRandomBytes } from "@/testing/random-bytes";
import { createAccountRuntime } from "./account-runtime";

jest.mock("@english-learn/api-client", () => ({
  ...jest.requireActual("@english-learn/api-client"),
  createApiClient: jest.fn(),
}));
jest.mock("@/infrastructure/auth/account-config", () => ({
  accountEndpoints: () => ({
    apiBaseUrl: "https://api.example.test",
    googleAuthUrl: "https://auth.example.test",
  }),
}));
jest.mock("@/infrastructure/auth/callback-relay", () => ({
  COMPLETE_PATH: "/auth/completar",
  createCallbackStash: () => ({}),
  browserRelayChannel: () => null,
  watchCallbackHandOff: () => () => {},
}));
jest.mock("@/infrastructure/persistence/app-page-release", () => ({
  leavePage: async (navigate: () => void) => navigate(),
}));

const ACCOUNT = { userId: "user-1", email: "ana@example.com" };
const LOCAL: StoredEvent = {
  id: "0190000-local",
  deviceId: "device-a",
  occurredAt: 1_000,
  localDate: "2026-10-30",
  type: "session_completed",
  payload: { v: 1 },
};

function setup() {
  const api = {
    signInWithGoogle: jest.fn(async () => ({
      accessToken: "access-1",
      accessTokenExpiresAt: "2030-01-01T00:00:00Z",
      user: { id: ACCOUNT.userId, email: ACCOUNT.email },
    })),
    refresh: jest.fn(async () => ({
      accessToken: "access-2",
      accessTokenExpiresAt: "2030-01-01T00:00:00Z",
    })),
    sync: jest.fn(async (): Promise<SyncResponse> => ({
      events: [],
      cursor: 7,
      hasMore: false,
      accepted: 1,
      duplicates: 0,
      conflicts: [],
    })),
    logout: jest.fn(async () => {}),
    deleteAccount: jest.fn(async () => {}),
  };
  jest
    .mocked(createApiClient)
    .mockReturnValue(api as unknown as ReturnType<typeof createApiClient>);
  const settings = createFakeSettingsRepository();
  const store = createFakeSyncStore({ local: [LOCAL] });
  const localChanges = createChangeSignal();
  const runtime = createAccountRuntime({
    storage: { syncStore: store, localChanges },
    settings,
    randomBytes: createTestRandomBytes(),
    clock: { nowMs: () => 1_000, today: () => localDate("2026-10-30") },
    openCallbackCompletion: jest.fn(),
  });
  return { api, settings, store, localChanges, ...runtime };
}

describe("account runtime sync safety", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.assign(new EventTarget(), {
        location: {
          origin: "https://english.example.test",
          pathname: "/auth/completar",
          assign: jest.fn(),
        },
        sessionStorage: (() => {
          const items = new Map<string, string>();
          return {
            getItem: (k: string) => items.get(k) ?? null,
            setItem: (k: string, v: string) => items.set(k, v),
            removeItem: (k: string) => items.delete(k),
          };
        })(),
      }),
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    jest.restoreAllMocks();
  });

  it.each([
    ["network", new TypeError("Failed to fetch")],
    ["503", new ApiError(503, "unavailable", "Try later")],
    ["429", new ApiError(429, "rate_limited", "Try later", 10)],
  ])(
    "keeps the account and pending progress after a temporary %s refresh failure",
    async (_, error) => {
      const { api, settings, store, session, coordinator } = setup();
      await session.signIn("id-token", "nonce");
      api.sync.mockRejectedValueOnce(new ApiError(401, "invalid_token", "Expired"));
      api.refresh.mockRejectedValueOnce(error);

      await coordinator.request();

      expect(api.refresh).toHaveBeenCalledTimes(1);
      expect(session.getState()).toEqual({ status: "signed-in", account: ACCOUNT });
      expect(settings.account()).toEqual(ACCOUNT);
      expect(session.accessToken()).toBe("access-1");
      expect(coordinator.getStatus().kind).toBe("error");
      expect(store.unsynced()).toEqual([LOCAL.id]);
      expect(await store.getSyncCursor()).toBe(0);
      expect(store.remoteIds()).toEqual([]);

      // A later trigger retries the refresh, then uploads the same pending event.
      api.sync.mockRejectedValueOnce(new ApiError(401, "invalid_token", "Expired"));
      await coordinator.request();

      expect(api.refresh).toHaveBeenCalledTimes(2);
      expect(coordinator.getStatus().kind).toBe("synced");
      expect(settings.account()).toEqual(ACCOUNT);
      expect(store.unsynced()).toEqual([]);
      expect(await store.getSyncCursor()).toBe(7);
    },
  );

  it("still forgets an unauthorized session without losing pending local progress", async () => {
    const { api, settings, store, session, coordinator } = setup();
    await session.signIn("id-token", "nonce");
    api.sync.mockRejectedValueOnce(new ApiError(401, "invalid_token", "Expired"));
    api.refresh.mockRejectedValueOnce(new ApiError(401, "unauthorized", "Session ended"));

    await coordinator.request();

    expect(session.getState()).toEqual({ status: "signed-out" });
    expect(settings.account()).toBeNull();
    expect(session.accessToken()).toBeNull();
    expect(coordinator.getStatus().kind).toBe("idle");
    expect(store.unsynced()).toEqual([LOCAL.id]);
    expect(await store.getSyncCursor()).toBe(0);
    expect(store.remoteIds()).toEqual([]);
  });
  async function dataHash(store: ReturnType<typeof createFakeSyncStore>) {
    return createHash("sha256")
      .update(
        JSON.stringify({
          events: await store.getUnsyncedEvents(99),
          pending: store.unsynced(),
          remote: store.remoteIds(),
          cursor: await store.getSyncCursor(),
          device: await store.getDeviceId(),
        }),
      )
      .digest("hex");
  }
  it("rejects the wrong account without changing progress or allowing later background sync", async () => {
    const { api, settings, store, session, controller, coordinator, localChanges, start } = setup();
    const stop = start();
    try {
      await session.signIn("id-token", "nonce");
      await store.setSyncCursor(42);
      const before = await dataHash(store);
      api.deleteAccount.mockRejectedValueOnce(
        new ApiError(401, "reauthentication_required", "Sign in again"),
      );
      expect(await controller.deleteAccount()).toBe("redirecting");
      api.signInWithGoogle.mockResolvedValueOnce({
        accessToken: "wrong-account-token",
        accessTokenExpiresAt: "2030-01-01T00:00:00Z",
        user: { id: "user-2", email: "ben@example.com" },
      });
      const redirect = jest.mocked(window.location.assign).mock.calls.at(-1)![0];
      const state = new URL(String(redirect)).searchParams.get("state");
      await expect(
        controller.completeSignIn(`#id_token=id.token.sig&state=${state}`),
      ).rejects.toMatchObject({ reason: "wrong-account" });
      const after = await dataHash(store);
      expect(after).toBe(before);
      expect(settings.account()).toBeNull();
      expect(session.accessToken()).toBeNull();
      expect(session.getState()).toEqual({ status: "signed-out" });
      localChanges.emit();
      window.dispatchEvent(new Event("online"));
      await coordinator.request();
      expect(api.sync).not.toHaveBeenCalled();
      expect(api.deleteAccount).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });
  it("still syncs ordinary sign-in and deletes after same-account reauthentication", async () => {
    const { api, controller, session, store, start } = setup();
    const stop = start();
    try {
      controller.startSignIn("/placement");
      let redirect = jest.mocked(window.location.assign).mock.calls.at(-1)![0];
      let state = new URL(String(redirect)).searchParams.get("state");
      expect(await controller.completeSignIn(`#id_token=id.token.sig&state=${state}`)).toBe(
        "/placement",
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(api.sync).toHaveBeenCalledTimes(1);
      api.deleteAccount.mockRejectedValueOnce(
        new ApiError(401, "reauthentication_required", "Sign in again"),
      );
      expect(await controller.deleteAccount()).toBe("redirecting");
      redirect = jest.mocked(window.location.assign).mock.calls.at(-1)![0];
      state = new URL(String(redirect)).searchParams.get("state");
      expect(await controller.completeSignIn(`#id_token=id.token.sig&state=${state}`)).toBe(
        "/cuenta?eliminada=1",
      );
      expect(api.deleteAccount).toHaveBeenCalledTimes(2);
      expect(session.getState()).toEqual({ status: "signed-out" });
      expect(store.unsynced()).toEqual([LOCAL.id]);
    } finally {
      stop();
    }
  });
});
