import { ApiError, type SyncResponse } from "@english-learn/api-client";
import type { StoredEvent } from "@english-learn/domain";
import { createPendingSignInStore } from "@/infrastructure/auth/oidc";
import { createSyncCoordinator } from "@/infrastructure/sync/sync-coordinator";
import { createSyncEngine } from "@/infrastructure/sync/sync-engine";
import { createFakeSyncStore } from "@/testing/fake-sync-store";
import { createTestRandomBytes } from "@/testing/random-bytes";
import { createAccountController } from "./account-controller";

const ORIGIN = "https://english.maumar.com.ar";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

function setup() {
  const redirects: string[] = [];
  const session = {
    signIn: jest.fn(async () => ({ userId: "u1", email: "ana@example.com" })),
    signOut: jest.fn(async () => {}),
    forget: jest.fn(),
    getState: () => ({
      status: "signed-in" as const,
      account: { userId: "u1", email: "ana@example.com" },
    }),
    authorized: jest.fn(async (call: (token: string | null) => Promise<unknown>) =>
      call("access"),
    ) as unknown as <T>(call: (token: string | null) => Promise<T>) => Promise<T>,
  };
  const coordinator = {
    request: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    resume: jest.fn(),
  };
  const store = { resetSyncState: jest.fn(async () => {}), clearProgress: jest.fn(async () => {}) };
  const settings = {
    clearPathLevel: jest.fn(async () => {}),
    clearSeenLevelIntros: jest.fn(async () => {}),
  };
  const deleteAccount = jest.fn(async () => {});
  const onProgressChanged = jest.fn();
  const controller = createAccountController({
    origin: ORIGIN,
    session,
    coordinator,
    store,
    settings,
    deleteAccount,
    pending: createPendingSignInStore(memoryStorage(), () => 1_000),
    randomBytes: createTestRandomBytes(),
    now: () => 1_000,
    redirect: (url) => redirects.push(url),
    onProgressChanged,
  });
  /** What Google would put in the callback URL for the last redirect. */
  const callbackHash = (idToken = "id.token.sig") => {
    const url = new URL(redirects.at(-1)!);
    return `#id_token=${idToken}&state=${url.searchParams.get("state")}`;
  };
  const lastNonce = () => new URL(redirects.at(-1)!).searchParams.get("nonce");
  return {
    controller,
    session,
    coordinator,
    store,
    settings,
    deleteAccount,
    onProgressChanged,
    redirects,
    callbackHash,
    lastNonce,
  };
}

describe("createAccountController", () => {
  it("sends the learner to Google with a fresh state and nonce and this site's callback", () => {
    const { controller, redirects } = setup();

    controller.startSignIn("/placement");
    controller.startSignIn("/placement");

    const [first, second] = redirects.map((r) => new URL(r).searchParams);
    expect(first?.get("redirect_uri")).toBe(`${ORIGIN}/auth/callback`);
    expect(first?.get("state")).not.toBe(second?.get("state"));
    expect(first?.get("nonce")).not.toBe(first?.get("state"));
  });

  it("completes the sign-in with the nonce, syncs and returns where the learner was", async () => {
    const { controller, session, coordinator, redirects, callbackHash, lastNonce } = setup();
    controller.startSignIn("/placement");
    expect(redirects).toHaveLength(1);

    const returnTo = await controller.completeSignIn(callbackHash());

    expect(session.signIn).toHaveBeenCalledWith("id.token.sig", lastNonce());
    expect(coordinator.request).toHaveBeenCalled();
    expect(returnTo).toBe("/placement");
  });

  it("refuses a callback whose state it did not issue", async () => {
    const { controller, session } = setup();
    controller.startSignIn("/cuenta");

    await expect(controller.completeSignIn("#id_token=a.b.c&state=forged")).rejects.toMatchObject({
      reason: "state",
    });
    expect(session.signIn).not.toHaveBeenCalled();
  });

  it("reports that the learner cancelled at Google", async () => {
    const { controller, redirects } = setup();
    controller.startSignIn("/cuenta");
    const state = new URL(redirects[0]!).searchParams.get("state");

    await expect(
      controller.completeSignIn(`#error=access_denied&state=${state}`),
    ).rejects.toMatchObject({ reason: "cancelled" });
  });

  it("signs out keeping local progress: the next account gets the whole log", async () => {
    const { controller, session, store, coordinator, onProgressChanged } = setup();

    await controller.signOut({ keepLocalProgress: true });

    expect(session.signOut).toHaveBeenCalled();
    expect(coordinator.stop).toHaveBeenCalled();
    expect(store.resetSyncState).toHaveBeenCalled();
    expect(store.clearProgress).not.toHaveBeenCalled();
    expect(onProgressChanged).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "finishes the local work before reporting signed out (keepLocalProgress: %s)",
    async (keepLocalProgress) => {
      // The screen shows "signed out" as soon as the session says so, and the learner may then
      // reload or close the page: the sync must be stopped and the store done by then.
      const { controller, session, store, coordinator } = setup();
      const calls: string[] = [];
      coordinator.stop.mockImplementation(async () => void calls.push("stop sync"));
      store.resetSyncState.mockImplementation(async () => void calls.push("store"));
      store.clearProgress.mockImplementation(async () => void calls.push("store"));
      session.signOut.mockImplementation(async () => void calls.push("session"));

      await controller.signOut({ keepLocalProgress });

      expect(calls).toEqual(["stop sync", "store", "session"]);
    },
  );

  it("stays signed in, syncing again, when the local work fails", async () => {
    const { controller, session, store, coordinator } = setup();
    store.clearProgress.mockRejectedValueOnce(new Error("disk full"));

    await expect(controller.signOut({ keepLocalProgress: false })).rejects.toThrow("disk full");

    expect(session.signOut).not.toHaveBeenCalled();
    expect(coordinator.resume).toHaveBeenCalled();
  });

  it("signs out deleting local progress from this device", async () => {
    const { controller, store, settings, onProgressChanged } = setup();

    await controller.signOut({ keepLocalProgress: false });

    expect(store.clearProgress).toHaveBeenCalled();
    // The path follows the automatic level again.
    expect(settings.clearPathLevel).toHaveBeenCalled();
    // The next learner sees each level's intro again.
    expect(settings.clearSeenLevelIntros).toHaveBeenCalled();
    expect(onProgressChanged).toHaveBeenCalled();
  });

  it("keeps the path level when the local progress stays", async () => {
    const { controller, settings } = setup();

    await controller.signOut({ keepLocalProgress: true });

    expect(settings.clearPathLevel).not.toHaveBeenCalled();
    expect(settings.clearSeenLevelIntros).not.toHaveBeenCalled();
  });

  it("deletes the account and forgets the session, keeping local progress", async () => {
    const { controller, session, store, deleteAccount } = setup();

    expect(await controller.deleteAccount()).toBe("deleted");
    expect(deleteAccount).toHaveBeenCalled();
    expect(session.forget).toHaveBeenCalled();
    expect(store.resetSyncState).toHaveBeenCalled();
  });

  it("re-authenticates with Google when the sign-in is too old, then deletes on return", async () => {
    const { controller, deleteAccount, redirects, callbackHash, session } = setup();
    deleteAccount.mockRejectedValueOnce(
      new ApiError(401, "reauthentication_required", "sign in again"),
    );

    expect(await controller.deleteAccount()).toBe("redirecting");
    expect(redirects).toHaveLength(1);

    const returnTo = await controller.completeSignIn(callbackHash());

    expect(deleteAccount).toHaveBeenCalledTimes(2);
    expect(session.forget).toHaveBeenCalled();
    expect(returnTo).toBe("/cuenta?eliminada=1");
  });

  it("never deletes another account than the one that asked", async () => {
    const { controller, deleteAccount, callbackHash, session } = setup();
    deleteAccount.mockRejectedValueOnce(
      new ApiError(401, "reauthentication_required", "sign in again"),
    );
    await controller.deleteAccount();
    session.signIn.mockResolvedValueOnce({ userId: "someone-else", email: "ben@example.com" });

    await expect(controller.completeSignIn(callbackHash())).rejects.toMatchObject({
      reason: "wrong-account",
    });
    expect(deleteAccount).toHaveBeenCalledTimes(1);
  });
});

describe("signing out while a sync is in flight", () => {
  const local: StoredEvent = {
    id: "0190000-local",
    deviceId: "device-a",
    occurredAt: 1_000,
    localDate: "2026-10-30",
    type: "session_completed",
    payload: { v: 1 },
  };

  function wire() {
    const store = createFakeSyncStore({ local: [local] });
    const answer = (): SyncResponse => ({
      events: [{ ...local, payload: { v: 1 } }],
      cursor: 1,
      hasMore: false,
      accepted: 1,
      duplicates: 0,
      conflicts: [],
    });
    const held: (() => void)[] = [];
    let hold = false;
    const api = {
      // The account already holds this device's event: every answer sends it back.
      sync: jest.fn(
        () =>
          new Promise<SyncResponse>((resolve) => {
            if (hold) held.push(() => resolve(answer()));
            else resolve(answer());
          }),
      ),
    };
    /** Starts a sync whose answer waits for `release()`; resolves once its request is out. */
    async function syncInFlight() {
      hold = true;
      const done = coordinator.request();
      while (held.length === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      return {
        done,
        release: () => {
          hold = false;
          held.splice(0).forEach((resolve) => resolve());
        },
      };
    }
    const engine = createSyncEngine({
      api,
      store,
      refreshSession: async () => true,
      newDeviceId: () => "device-new",
      sleep: async () => {},
      random: () => 0.5,
      isOnline: () => true,
    });
    const coordinator = createSyncCoordinator({
      engine,
      onProgressChanged: () => {},
      onSignedOut: () => {},
    });
    const session = {
      signIn: jest.fn(async () => ({ userId: "u1", email: "ana@example.com" })),
      signOut: jest.fn(async () => {}),
      forget: jest.fn(),
      getState: () => ({ status: "signed-out" as const }),
      authorized: jest.fn() as never,
    };
    const controller = createAccountController({
      origin: ORIGIN,
      session,
      coordinator,
      store,
      settings: { clearPathLevel: async () => {}, clearSeenLevelIntros: async () => {} },
      deleteAccount: async () => {},
      pending: createPendingSignInStore(memoryStorage(), () => 1_000),
      randomBytes: createTestRandomBytes(),
      redirect: () => {},
      onProgressChanged: () => {},
    });
    return { store, coordinator, controller, api, syncInFlight };
  }

  it("deleting local progress: the answer of the sync in flight does not bring it back", async () => {
    const { store, controller, syncInFlight } = wire();
    // Signed in, the first sync still waits for the server's answer.
    const sync = await syncInFlight();

    const signedOut = controller.signOut({ keepLocalProgress: false });
    sync.release();
    await Promise.all([signedOut, sync.done]);

    expect(await store.getUnsyncedEvents(10)).toEqual([]);
    expect(store.remoteIds()).toEqual([]);
    expect(await store.getSyncCursor()).toBe(0);
  });

  it("keeping local progress: the sync in flight does not mark it synced again", async () => {
    const { store, controller, syncInFlight } = wire();
    const sync = await syncInFlight();

    const signedOut = controller.signOut({ keepLocalProgress: true });
    sync.release();
    await Promise.all([signedOut, sync.done]);

    expect(store.unsynced()).toEqual([local.id]);
    expect(await store.getSyncCursor()).toBe(0);
  });

  it("makes no sync request once signed out", async () => {
    const { coordinator, controller, api } = wire();

    await controller.signOut({ keepLocalProgress: false });
    await coordinator.request();

    expect(api.sync).not.toHaveBeenCalled();
  });
});
