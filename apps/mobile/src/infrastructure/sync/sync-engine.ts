import {
  ApiError,
  type SyncEvent,
  type SyncRequest,
  type SyncResponse,
} from "@english-learn/api-client";
import type { ProgressSyncStore, StoredEvent } from "@english-learn/domain";

/** The event log as the engine needs it (the SQLite progress repository implements it). */
export type SyncStore = ProgressSyncStore & {
  getDeviceId(): Promise<string>;
  replaceDeviceId(id: string): Promise<void>;
};

export type SyncEngineDeps = {
  readonly api: { sync(request: SyncRequest): Promise<SyncResponse> };
  readonly store: SyncStore;
  /** Gets a new access token; false when the session is over. */
  readonly refreshSession: () => Promise<boolean>;
  /** A fresh device id, for when the server says ours belongs to another account. */
  readonly newDeviceId: () => string;
  readonly sleep: (ms: number) => Promise<void>;
  /** In [0, 1), for backoff jitter. */
  readonly random: () => number;
  readonly isOnline: () => boolean;
};

export type SyncOutcome =
  | {
      readonly kind: "synced";
      /** Events from other devices were stored: progress changed. */
      readonly changed: boolean;
      readonly uploaded: number;
      readonly downloaded: number;
    }
  | { readonly kind: "offline" }
  | { readonly kind: "signed-out" }
  | { readonly kind: "error"; readonly message: string };

/** The API's limits: 500 events per upload and a 1 MiB body; we stay well under the latter. */
export const MAX_BATCH_EVENTS = 500;
export const MAX_BATCH_BYTES = 900_000;
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;
/** A longer Retry-After is not waited for here; the next scheduled sync tries again. */
const MAX_RETRY_AFTER_MS = 5 * 60_000;
const DEFAULT_RETRY_AFTER_MS = 30_000;
/** Safety net against a server that keeps answering `hasMore`. */
const MAX_ROUNDS = 1_000;

const encoder = new TextEncoder();
const utf8Length = (text: string) => encoder.encode(text).length;

/** The longest prefix of `events` within the event and size limits (at least one event). */
export function takeBatch<T>(events: readonly T[]): T[] {
  const batch: T[] = [];
  let bytes = 100; // the envelope: deviceId, cursor, brackets
  for (const event of events) {
    if (batch.length === MAX_BATCH_EVENTS) break;
    const size = utf8Length(JSON.stringify(event)) + 1;
    if (batch.length > 0 && bytes + size > MAX_BATCH_BYTES) break;
    batch.push(event);
    bytes += size;
  }
  return batch;
}

function toWire({ id, occurredAt, localDate, type, payload }: StoredEvent): SyncEvent {
  return { id, occurredAt, localDate, type, payload: payload as SyncEvent["payload"] };
}

class SyncStop extends Error {
  constructor(readonly outcome: Exclude<SyncOutcome, { kind: "synced" }>) {
    super(outcome.kind);
  }
}

const isNetworkError = (error: unknown) => !(error instanceof ApiError);

function describe(error: unknown): string {
  if (error instanceof ApiError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

/**
 * Two-way progress sync with `POST /v1/sync`: every request uploads a batch of unsynced local
 * events and downloads the account's events after the cursor. It loops while local events
 * remain or the server has more, applies downloaded events (idempotent by id, the cache is
 * refolded), marks uploads synced and stores the cursor after each answer, so an interrupted
 * sync resumes where it stopped.
 *
 * Failures: network errors and 5xx back off exponentially with jitter (5 attempts), 429 waits
 * `Retry-After`, 401 refreshes the session once, 409 `device_conflict` takes a new device id once,
 * and conflicting event ids are only logged (the server keeps the first version).
 */
export function createSyncEngine(deps: SyncEngineDeps) {
  const { api, store } = deps;

  async function send(request: Omit<SyncRequest, "deviceId">): Promise<SyncResponse> {
    let refreshed = false;
    let replacedDevice = false;
    let attempt = 0;
    for (;;) {
      if (!deps.isOnline()) throw new SyncStop({ kind: "offline" });
      attempt += 1;
      try {
        return await api.sync({ deviceId: await store.getDeviceId(), ...request });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          if (refreshed || !(await deps.refreshSession())) {
            throw new SyncStop({ kind: "signed-out" });
          }
          refreshed = true;
          attempt -= 1;
          continue;
        }
        if (error instanceof ApiError && error.code === "device_conflict" && !replacedDevice) {
          replacedDevice = true;
          await store.replaceDeviceId(deps.newDeviceId());
          attempt -= 1;
          continue;
        }
        const retryable =
          isNetworkError(error) ||
          (error instanceof ApiError && (error.status >= 500 || error.status === 429));
        if (!retryable) throw new SyncStop({ kind: "error", message: describe(error) });
        if (isNetworkError(error) && !deps.isOnline()) throw new SyncStop({ kind: "offline" });
        if (attempt >= MAX_ATTEMPTS) {
          throw new SyncStop(
            isNetworkError(error)
              ? { kind: "offline" }
              : { kind: "error", message: describe(error) },
          );
        }
        await deps.sleep(delayFor(error, attempt));
      }
    }
  }

  function delayFor(error: unknown, attempt: number): number {
    if (error instanceof ApiError && error.status === 429) {
      const wait =
        error.retryAfterSeconds === null ? DEFAULT_RETRY_AFTER_MS : error.retryAfterSeconds * 1000;
      if (wait > MAX_RETRY_AFTER_MS) {
        throw new SyncStop({ kind: "error", message: describe(error) });
      }
      return wait;
    }
    const exponential = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1));
    return Math.round(exponential * (0.5 + deps.random() * 0.5));
  }

  async function run(): Promise<SyncOutcome> {
    if (!deps.isOnline()) return { kind: "offline" };
    let uploaded = 0;
    let downloaded = 0;
    try {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const batch = takeBatch(await store.getUnsyncedEvents(MAX_BATCH_EVENTS));
        const cursor = await store.getSyncCursor();
        const response = await send({
          cursor: cursor > 0 ? cursor : null,
          events: batch.map(toWire),
        });

        if (response.events.length > 0) {
          downloaded += await store.insertRemoteEvents(response.events);
        }
        if (batch.length > 0) {
          await store.markSynced(
            batch.map((e) => e.id),
            batch.map(() => null),
          );
          uploaded += batch.length;
        }
        await store.setSyncCursor(response.cursor);
        if (response.conflicts.length > 0) {
          // The server kept its first version of these ids; nothing to do on this side.
          console.warn("Sync: events conflicting with the server's copy", response.conflicts);
        }
        const moreLocal = (await store.getUnsyncedEvents(1)).length > 0;
        if (!moreLocal && !response.hasMore) break;
      }
    } catch (error) {
      if (error instanceof SyncStop) return error.outcome;
      console.error("Sync failed", error);
      return { kind: "error", message: describe(error) };
    }
    return { kind: "synced", changed: downloaded > 0, uploaded, downloaded };
  }

  return { run };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
