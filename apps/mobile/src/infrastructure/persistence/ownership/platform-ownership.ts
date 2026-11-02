import { Platform } from "react-native";
import { createBrowserOwnership } from "./browser-ownership";
import type { DatabaseOwnership, OwnershipState } from "./database-ownership";

const OWNED: OwnershipState = {
  kind: "owned",
  diagnostics: {
    reason: "probe-skipped",
    startedAt: 0,
    decidedAt: 0,
    lockHolders: null,
    probeError: null,
    takeOverAttempts: 0,
    environment: { webLocks: false, broadcastChannel: false, opfs: false, displayMode: "unknown" },
  },
};

/** Native apps own their database file alone: nothing to coordinate. */
const nativeOwnership: DatabaseOwnership = {
  start: async () => OWNED,
  takeOver: async () => OWNED,
  retry: async () => OWNED,
  confirmOpened: () => {},
  serve: () => () => {},
};

export function createPlatformOwnership(): DatabaseOwnership {
  return Platform.OS === "web" && typeof window !== "undefined"
    ? createBrowserOwnership()
    : nativeOwnership;
}
