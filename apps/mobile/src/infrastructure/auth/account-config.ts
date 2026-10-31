/**
 * Where accounts work. The refresh token is an HttpOnly `SameSite=Strict` cookie of the API host,
 * so sign-in only works from a page on the same site as the API (`maumar.com.ar`). Other hosts of
 * the web app (the old `*.pages.dev` address) show a note instead of a sign-in button.
 */
import type * as E2eEndpoints from "./e2e-endpoints";
import { GOOGLE_AUTHORIZATION_ENDPOINT } from "./oidc";

export const APP_WEB_ORIGIN = "https://english.maumar.com.ar";
export const PRODUCTION_API_BASE_URL = "https://english-api.maumar.com.ar";
export const DEVELOPMENT_API_BASE_URL = "http://localhost:8000";

export type AccountAvailability =
  /** Web, on the app's own site (or a local dev server): sign-in and sync work. */
  | "available"
  /** Web on another site: the session cookie cannot work there. */
  | "wrong-origin"
  /** The native app: accounts come later. */
  | "native";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function accountAvailability(platform: string, origin: string | null): AccountAvailability {
  if (platform !== "web") return "native";
  if (origin === APP_WEB_ORIGIN) return "available";
  try {
    const url = new URL(origin ?? "");
    return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname) ? "available" : "wrong-origin";
  } catch {
    return "wrong-origin";
  }
}

/** `EXPO_PUBLIC_API_BASE_URL` when set; otherwise production or the local API. */
export function resolveApiBaseUrl(configured: string | undefined, development: boolean): string {
  if (configured) return configured;
  return development ? DEVELOPMENT_API_BASE_URL : PRODUCTION_API_BASE_URL;
}

/**
 * The API this build talks to (`EXPO_PUBLIC_*` is inlined at build time) and Google's
 * authorization endpoint. E2E builds let a spec substitute fakes for both; production builds drop
 * that branch and its module.
 */
export function accountEndpoints(): { apiBaseUrl: string; googleAuthUrl: string } {
  const endpoints = {
    apiBaseUrl: resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__),
    googleAuthUrl: GOOGLE_AUTHORIZATION_ENDPOINT,
  };
  if (process.env.EXPO_PUBLIC_E2E === "1") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { e2eEndpoints } = require("./e2e-endpoints") as typeof E2eEndpoints;
    return { ...endpoints, ...e2eEndpoints() };
  }
  return endpoints;
}
