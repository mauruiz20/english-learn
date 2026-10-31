import { ApiError } from "@english-learn/api-client";
import { createPendingSignInStore } from "@/infrastructure/auth/oidc";
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
    authorized: jest.fn(<T>(call: (token: string | null) => Promise<T>) => call("access")),
  };
  const coordinator = { request: jest.fn(async () => {}), reset: jest.fn() };
  const store = { resetSyncState: jest.fn(async () => {}), clearProgress: jest.fn(async () => {}) };
  const deleteAccount = jest.fn(async () => {});
  const onProgressChanged = jest.fn();
  const controller = createAccountController({
    origin: ORIGIN,
    session,
    coordinator,
    store,
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
    expect(coordinator.reset).toHaveBeenCalled();
    expect(store.resetSyncState).toHaveBeenCalled();
    expect(store.clearProgress).not.toHaveBeenCalled();
    expect(onProgressChanged).not.toHaveBeenCalled();
  });

  it("signs out deleting local progress from this device", async () => {
    const { controller, store, onProgressChanged } = setup();

    await controller.signOut({ keepLocalProgress: false });

    expect(store.clearProgress).toHaveBeenCalled();
    expect(onProgressChanged).toHaveBeenCalled();
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
