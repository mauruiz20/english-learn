import type { RemoteEvent, StoredEvent } from "@english-learn/domain";
import type { SyncStore } from "@/infrastructure/sync/sync-engine";

/** In-memory `SyncStore` (the SQLite event log as the sync engine sees it) for tests. */
export function createFakeSyncStore({
  local = [],
  deviceId = "device-a",
}: { local?: readonly StoredEvent[]; deviceId?: string } = {}) {
  const events = new Map<string, { event: StoredEvent; synced: boolean; remote: boolean }>(
    local.map((event) => [event.id, { event, synced: false, remote: false }]),
  );
  let cursor = 0;
  let device = deviceId;

  const store = {
    getDeviceId: async () => device,
    replaceDeviceId: async (id: string) => {
      device = id;
    },
    getUnsyncedEvents: async (limit: number) =>
      [...events.values()]
        .filter((e) => !e.synced)
        .map((e) => e.event)
        .sort((a, b) => a.occurredAt - b.occurredAt || (a.id < b.id ? -1 : 1))
        .slice(0, limit),
    markSynced: async (ids: readonly string[]) => {
      for (const id of ids) {
        const entry = events.get(id);
        if (entry) entry.synced = true;
      }
    },
    getSyncCursor: async () => cursor,
    setSyncCursor: async (next: number) => {
      cursor = next;
    },
    insertRemoteEvents: async (remote: readonly RemoteEvent[]) => {
      let inserted = 0;
      for (const { serverSeq: _, ...event } of remote) {
        if (events.has(event.id)) continue;
        events.set(event.id, { event, synced: true, remote: true });
        inserted += 1;
      }
      return inserted;
    },
    resetSyncState: async () => {
      cursor = 0;
      for (const entry of events.values()) entry.synced = false;
    },
    clearProgress: async () => {
      events.clear();
      cursor = 0;
    },
    /** Ids not acknowledged by the server yet. */
    unsynced: () => [...events.values()].filter((e) => !e.synced).map((e) => e.event.id),
    /** Ids of events pulled from the server, in arrival order. */
    remoteIds: () => [...events.values()].filter((e) => e.remote).map((e) => e.event.id),
    /** Add a locally written event (like a completed session). */
    addLocal: (event: StoredEvent) => {
      events.set(event.id, { event, synced: false, remote: false });
    },
  } satisfies SyncStore & Record<string, unknown>;
  return store;
}

export type FakeSyncStore = ReturnType<typeof createFakeSyncStore>;
