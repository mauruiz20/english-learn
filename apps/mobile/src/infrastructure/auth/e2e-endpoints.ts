/**
 * TEST-ONLY. Lets an e2e spec point the app at its fake API and fake Google sign-in page, and
 * name the local servers that play the app's old and new web addresses, by storing their URLs in
 * `localStorage` before the app starts. (Playwright routes cannot stand in for them: in WebKit,
 * request interception breaks the blob-URL worker expo-sqlite runs in.) Required only when the
 * web build is exported with `EXPO_PUBLIC_E2E=1`; never in production.
 */
export type E2eEndpoints = {
  apiBaseUrl?: string;
  googleAuthUrl?: string;
  oldWebOrigin?: string;
  newWebOrigin?: string;
};

const PREFIX = "english-learn.e2e.";
const KEYS = ["apiBaseUrl", "googleAuthUrl", "oldWebOrigin", "newWebOrigin"] as const;

export function e2eEndpoints(
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): E2eEndpoints {
  if (storage === undefined) return {};
  const endpoints: E2eEndpoints = {};
  for (const key of KEYS) {
    const value = storage.getItem(`${PREFIX}${key}`);
    if (value) endpoints[key] = value;
  }
  return endpoints;
}
