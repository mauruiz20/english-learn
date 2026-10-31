import type { SyncOutcome } from "./sync-engine";

/** What the account screen shows about sync. */
export type SyncStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "syncing" }
  /** `at`: epoch ms of the last successful sync. */
  | { readonly kind: "synced"; readonly at: number }
  | { readonly kind: "offline" }
  | { readonly kind: "error"; readonly message: string };

/**
 * Runs the sync engine one sync at a time and keeps its status. A request that arrives while a
 * sync runs is not lost: the sync runs once more afterwards (a session completed mid-sync gets
 * uploaded), and every caller waits for that.
 */
export function createSyncCoordinator({
  engine,
  now = Date.now,
  onProgressChanged,
  onSignedOut,
}: {
  engine: { run(): Promise<SyncOutcome> };
  now?: () => number;
  /** Events from another device arrived: screens reload their progress. */
  onProgressChanged: () => void;
  /** The session ended (401 after a refresh). */
  onSignedOut: () => void;
}) {
  let status: SyncStatus = { kind: "idle" };
  let running: Promise<void> | null = null;
  let again = false;
  const listeners = new Set<() => void>();

  const setStatus = (next: SyncStatus) => {
    status = next;
    for (const listener of listeners) listener();
  };

  async function loop(): Promise<void> {
    do {
      again = false;
      setStatus({ kind: "syncing" });
      const outcome = await engine.run();
      switch (outcome.kind) {
        case "synced":
          setStatus({ kind: "synced", at: now() });
          if (outcome.changed) onProgressChanged();
          break;
        case "signed-out":
          again = false;
          setStatus({ kind: "idle" });
          onSignedOut();
          return;
        case "offline":
          setStatus({ kind: "offline" });
          break;
        case "error":
          setStatus({ kind: "error", message: outcome.message });
          break;
      }
    } while (again);
  }

  return {
    getStatus: () => status,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Syncs now, or once more right after the sync in progress. */
    request(): Promise<void> {
      if (running !== null) {
        again = true;
        return running;
      }
      running = loop().finally(() => {
        running = null;
      });
      return running;
    },
    /** Back to idle (after signing out). */
    reset(): void {
      again = false;
      setStatus({ kind: "idle" });
    },
  };
}

export type SyncCoordinator = ReturnType<typeof createSyncCoordinator>;
