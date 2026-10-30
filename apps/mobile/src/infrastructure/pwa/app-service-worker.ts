// Native: there is no service worker (the app ships with its bundle). See the `.web.ts` file.
import type { ServiceWorkerUpdates } from "./service-worker-updates";

export const appServiceWorkerUpdates: ServiceWorkerUpdates = {
  start: async () => {},
  checkForUpdates: async () => {},
  apply: () => {},
  subscribe: () => () => {},
  getSnapshot: () => "idle",
};

/** Registers the web app's service worker; no-op on native. */
export function startServiceWorker(): void {}
