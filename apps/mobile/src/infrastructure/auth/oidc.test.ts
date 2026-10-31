import { createTestRandomBytes } from "@/testing/random-bytes";
import {
  createPendingSignInStore,
  googleAuthorizationUrl,
  parseCallbackFragment,
  randomToken,
  type PendingSignIn,
} from "./oidc";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const PENDING: PendingSignIn = {
  state: "state-1",
  nonce: "nonce-1",
  returnTo: "/cuenta",
  intent: "sign-in",
  createdAt: 1_000,
};

describe("googleAuthorizationUrl", () => {
  it("asks Google for an ID token through the implicit redirect flow", () => {
    const url = new URL(
      googleAuthorizationUrl({
        clientId: "client.apps.googleusercontent.com",
        redirectUri: "https://english.maumar.com.ar/auth/callback",
        state: "s t",
        nonce: "n&1",
      }),
    );

    expect(`${url.origin}${url.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client.apps.googleusercontent.com",
      redirect_uri: "https://english.maumar.com.ar/auth/callback",
      response_type: "id_token",
      scope: "openid email profile",
      nonce: "n&1",
      state: "s t",
      prompt: "select_account",
    });
  });
});

describe("randomToken", () => {
  it("encodes 32 random bytes as base64url, different every time", () => {
    const randomBytes = createTestRandomBytes();
    const first = randomToken(randomBytes);
    const second = randomToken(randomBytes);

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });
});

describe("parseCallbackFragment", () => {
  it("reads the ID token and the state", () => {
    expect(parseCallbackFragment("#id_token=a.b.c&state=s1&authuser=0")).toEqual({
      kind: "token",
      idToken: "a.b.c",
      state: "s1",
    });
  });

  it("reads an error Google sent back", () => {
    expect(parseCallbackFragment("#error=access_denied&state=s1")).toEqual({
      kind: "error",
      error: "access_denied",
      state: "s1",
    });
  });

  it.each(["", "#", "#id_token=a.b.c", "#state=s1", "#id_token=&state=s1"])(
    "rejects an incomplete fragment (%j)",
    (hash) => {
      expect(parseCallbackFragment(hash)).toEqual({ kind: "invalid" });
    },
  );
});

describe("createPendingSignInStore", () => {
  it("hands the pending sign-in back once, for its own state", () => {
    const storage = memoryStorage();
    const store = createPendingSignInStore(storage, () => 2_000);
    store.save(PENDING);

    expect(store.take("state-1")).toEqual(PENDING);
    expect(store.take("state-1")).toBeNull();
    expect(storage.items.size).toBe(0);
  });

  it("refuses another state and forgets the pending sign-in", () => {
    const store = createPendingSignInStore(memoryStorage(), () => 2_000);
    store.save(PENDING);

    expect(store.take("forged")).toBeNull();
    expect(store.take("state-1")).toBeNull();
  });

  it("refuses a sign-in started more than 10 minutes ago", () => {
    const store = createPendingSignInStore(memoryStorage(), () => 1_000 + 10 * 60_000 + 1);
    store.save(PENDING);

    expect(store.take("state-1")).toBeNull();
  });

  it("treats unreadable stored data as no pending sign-in", () => {
    const storage = memoryStorage();
    storage.setItem("english-learn.pending-sign-in", "{nope");

    expect(createPendingSignInStore(storage, () => 0).take("state-1")).toBeNull();
  });

  it("only returns to paths inside the app", () => {
    const store = createPendingSignInStore(memoryStorage(), () => 2_000);
    store.save({ ...PENDING, returnTo: "https://evil.example/" });

    expect(store.take("state-1")?.returnTo).toBe("/cuenta");
  });
});
