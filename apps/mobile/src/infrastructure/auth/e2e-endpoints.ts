/**
 * TEST-ONLY. Lets an e2e spec point the app at its fake API and fake Google sign-in page, by
 * storing their URLs in `localStorage` before the app starts. (Playwright routes cannot stand in
 * for them: in WebKit, request interception breaks the blob-URL worker expo-sqlite runs in.)
 * Required only when the web build is exported with `EXPO_PUBLIC_E2E=1`; never in production.
 */
export type E2eEndpoints = { apiBaseUrl?: string; googleAuthUrl?: string };

const PREFIX = "english-learn.e2e.";

export function e2eEndpoints(
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): E2eEndpoints {
  if (storage === undefined) return {};
  const apiBaseUrl = storage.getItem(`${PREFIX}apiBaseUrl`);
  const googleAuthUrl = storage.getItem(`${PREFIX}googleAuthUrl`);
  return {
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
    ...(googleAuthUrl ? { googleAuthUrl } : {}),
  };
}
