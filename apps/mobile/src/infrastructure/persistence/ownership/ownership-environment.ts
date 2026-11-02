import type { OwnershipEnvironment } from "./database-ownership";

type EnvironmentGlobals = {
  BroadcastChannel?: unknown;
  navigator?: {
    locks?: unknown;
    storage?: { getDirectory?: unknown };
    /** iOS: true in a web app opened from the Home Screen. */
    standalone?: boolean;
  };
  matchMedia?: (query: string) => { matches: boolean };
};

/**
 * What this browser offers for the database coordination, for "Detalles técnicos". Safe on
 * native and in tests (everything reads as missing).
 */
export function browserEnvironment(
  globals: EnvironmentGlobals = globalThis as unknown as EnvironmentGlobals,
): OwnershipEnvironment {
  let displayMode: OwnershipEnvironment["displayMode"] = "unknown";
  try {
    if (globals.navigator?.standalone === true) displayMode = "standalone";
    else if (typeof globals.matchMedia === "function") {
      displayMode = globals.matchMedia("(display-mode: standalone)").matches
        ? "standalone"
        : "browser";
    }
  } catch {
    // Unknown.
  }
  return {
    webLocks: globals.navigator?.locks !== undefined,
    broadcastChannel: typeof globals.BroadcastChannel === "function",
    opfs: typeof globals.navigator?.storage?.getDirectory === "function",
    displayMode,
  };
}
