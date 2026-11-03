import { Platform } from "react-native";
import { letGoOfOwnerLock } from "./ownership/browser-ownership";
import {
  createPageRelease,
  watchPageLifecycle,
  type PageRelease,
  type ReleasableWorker,
} from "./page-release";
import { countWorkers } from "./worker-count";

const isWeb = Platform.OS === "web" && typeof window !== "undefined";

/** Native: the app never navigates away from its own page; nothing to let go of. */
const nativeRelease: PageRelease = {
  setDrain: () => {},
  release: async () => {},
  releaseNow: () => {},
  released: () => false,
  leave: async (navigate) => navigate(),
};

function createAppPageRelease(): PageRelease {
  if (!isWeb) return nativeRelease;
  // Installed before expo-sqlite starts its worker (on the first open), so the page has it.
  const workers = countWorkers<ReleasableWorker>();
  const release = createPageRelease({ workers: workers.workers, letGoOfLock: letGoOfOwnerLock });
  watchPageLifecycle({ target: window, release, reload: () => window.location.reload() });
  return release;
}

/** This page's release (see `createPageRelease`): one per page, whatever React mounts. */
export const appPageRelease: PageRelease = createAppPageRelease();

/**
 * Every navigation or reload the app makes on purpose goes through here (web): the page lets go
 * of its database (writes, file handles, worker, owner lock) first, so a page iOS keeps frozen
 * in its back/forward cache holds nothing. Never hangs (bounded waits).
 */
export function leavePage(navigate: () => void): Promise<void> {
  return appPageRelease.leave(navigate);
}
