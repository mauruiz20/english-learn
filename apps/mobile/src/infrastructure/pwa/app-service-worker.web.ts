// Web: the app's service worker (offline app shell, see scripts/service-worker.mjs). Registered
// in production exports only (`expo export -p web`, the e2e export included), never by the dev
// server, whose bundles are not content-hashed and must not be cached.
import { leavePage } from "@/infrastructure/persistence/app-page-release";
import {
  createServiceWorkerUpdates,
  shouldRegisterServiceWorker,
  type ServiceWorkerUpdates,
} from "./service-worker-updates";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

const enabled =
  typeof window !== "undefined" &&
  shouldRegisterServiceWorker({
    isDev: __DEV__,
    hasServiceWorker: "serviceWorker" in navigator,
    isSecureContext: window.isSecureContext,
  });

const inert: ServiceWorkerUpdates = {
  start: async () => {},
  checkForUpdates: async () => {},
  apply: () => {},
  subscribe: () => () => {},
  getSnapshot: () => "idle",
};

export const appServiceWorkerUpdates: ServiceWorkerUpdates = enabled
  ? createServiceWorkerUpdates({
      container: navigator.serviceWorker,
      // "Actualizar": the page lets go of its database first (see `createPageRelease`).
      reload: () => void leavePage(() => window.location.reload()),
      // Offline update checks fail by design; the app keeps working from the cache.
      onError: (error) => console.warn("Service worker:", error),
    })
  : inert;

let started = false;

/** Registers the service worker once the page has loaded, then checks for new versions. */
export function startServiceWorker(): void {
  if (!enabled || started) return;
  started = true;
  const start = () => {
    void appServiceWorkerUpdates.start();
    // A long-lived tab or an installed app brought back to the foreground learns about deploys.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void appServiceWorkerUpdates.checkForUpdates();
    });
    setInterval(() => void appServiceWorkerUpdates.checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
