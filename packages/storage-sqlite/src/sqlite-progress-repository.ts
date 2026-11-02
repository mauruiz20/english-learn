import {
  EMPTY_STREAK,
  LEVELS,
  foldEvents,
  localDate,
  type AppendedEvents,
  type BaselineImportedEvent,
  type LessonResult,
  type Level,
  type PlacementResult,
  type ProgressRepository,
  type ProgressState,
  type ProgressSyncStore,
  type ProgressTotals,
  type ReviewState,
  type StoredEvent,
  type Streak,
} from "@english-learn/domain";
import type { SqlDatabase, SqlValue } from "./sql-database";

type ReviewStateRow = {
  item_id: string;
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  due_date: string;
};

type StreakRow = { current: number; longest: number; last_active_date: string | null };

type PlacementRow = { level: string; theta: number };

type LessonResultRow = { lesson_id: string; best_accuracy: number; completions: number };

type EventRow = {
  id: string;
  device_id: string;
  occurred_at: number;
  local_date: string;
  type: string;
  payload: string;
};

/** The cached progress a pre-event database holds, handed to `ensureBaseline`'s builder. */
export type ProgressCache = {
  readonly states: readonly ReviewState[];
  readonly xp: number;
  readonly streak: Streak;
  readonly placement: PlacementResult | null;
};

export type SqliteProgressRepository = ProgressRepository &
  ProgressSyncStore & {
    /**
     * Returns the stored device id, generating and storing one with `generate` the first time.
     */
    ensureDeviceId(generate: () => string): Promise<string>;
    /**
     * Upgrade path for progress written before the event log: when the log is empty and the
     * cache tables hold progress, stores the ONE `baseline_imported` event `build` returns for
     * that progress (the app adds the envelope and `completedLessonIds`, which storage cannot
     * know). Atomic and idempotent: resolves to whether a baseline was written.
     */
    ensureBaseline(build: (cache: ProgressCache) => BaselineImportedEvent): Promise<boolean>;
    /** Stores a new device id (the server answered that the old one belongs to another account). */
    replaceDeviceId(id: string): Promise<void>;
    /**
     * Forgets what the server has: every event becomes unsynced and the cursor goes back to 0, so
     * the next account this device signs in to receives the whole log. Progress is unchanged.
     */
    resetSyncState(): Promise<void>;
    /** Deletes every event and the cached progress (keeps the device id), in one transaction. */
    clearProgress(): Promise<void>;
    /** Every event of the log (synced or not), oldest first: what a transfer carries away. */
    getAllEvents(): Promise<StoredEvent[]>;
    /**
     * Adds events brought from another web origin of the app as LOCAL events: ids already stored
     * are ignored (idempotent), new ones are stored unsynced (the next sync uploads them; they are
     * never marked synced here), then the cache is rebuilt, in one transaction. Events this
     * version cannot read are kept for the fold to skip; unorderable ones are dropped. Resolves
     * to the number of events added.
     */
    importEvents(events: readonly StoredEvent[]): Promise<number>;
  };

export type SqliteProgressRepositoryOptions = {
  /** Wall clock (epoch ms) for `synced_at`. */
  readonly now?: () => number;
};

/** Stays well below SQLite's historical 999 bound-parameter limit. */
const MAX_IDS_PER_QUERY = 500;
/** Review states per multi-row upsert (6 parameters each). */
const STATES_PER_INSERT = 80;
/** Lesson results per multi-row insert (3 parameters each). */
const RESULTS_PER_INSERT = 150;

const DEVICE_ID = "device_id";
const SERVER_CURSOR = "server_cursor";

const SELECT_REVIEW_STATE =
  "SELECT item_id, ease, interval_days, reps, lapses, due_date FROM review_state";

function toReviewState(row: ReviewStateRow): ReviewState {
  return {
    itemId: row.item_id,
    ease: row.ease,
    intervalDays: row.interval_days,
    reps: row.reps,
    lapses: row.lapses,
    dueDate: localDate(row.due_date),
  };
}

function toLevel(value: string): Level {
  const level = LEVELS.find((candidate) => candidate === value);
  if (level === undefined) throw new Error(`Invalid stored level: "${value}"`);
  return level;
}

function byItemId(a: ReviewState, b: ReviewState): number {
  return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
}

function sameState(a: ReviewState, b: ReviewState): boolean {
  return (
    a.ease === b.ease &&
    a.intervalDays === b.intervalDays &&
    a.reps === b.reps &&
    a.lapses === b.lapses &&
    a.dueDate === b.dueDate
  );
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

function parsePayload(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Kept as text: the fold reports it as an invalid event instead of failing.
    return text;
  }
}

function toStoredEvent(row: EventRow): StoredEvent {
  return {
    id: row.id,
    deviceId: row.device_id,
    occurredAt: row.occurred_at,
    localDate: row.local_date,
    type: row.type,
    payload: parsePayload(row.payload),
  };
}

/** Envelope fields the event table needs (the fold re-validates everything on read). */
function isStorable(event: StoredEvent): boolean {
  return (
    typeof event.id === "string" &&
    event.id.length > 0 &&
    typeof event.deviceId === "string" &&
    typeof event.occurredAt === "number" &&
    Number.isFinite(event.occurredAt) &&
    typeof event.localDate === "string" &&
    typeof event.type === "string"
  );
}

/**
 * `ProgressRepository` (plus the sync store) backed by SQLite: an append-only `event` table is
 * the source of truth, and `review_state`, `xp`, `streak`, `placement_result` and `lesson_result`
 * cache its fold.
 * Every write refolds the whole log in the same transaction and writes only what changed.
 * Call `migrate(db)` before using it.
 */
export function createSqliteProgressRepository(
  db: SqlDatabase,
  { now = Date.now }: SqliteProgressRepositoryOptions = {},
): SqliteProgressRepository {
  // Helpers below run no transaction of their own, so they compose inside one.
  async function getStatesByIds(itemIds: readonly string[]): Promise<ReviewState[]> {
    const states: ReviewState[] = [];
    for (const chunk of chunks([...new Set(itemIds)], MAX_IDS_PER_QUERY)) {
      const rows = await db.getAllAsync<ReviewStateRow>(
        `${SELECT_REVIEW_STATE} WHERE item_id IN (${chunk.map(() => "?").join(", ")})`,
        chunk,
      );
      states.push(...rows.map(toReviewState));
    }
    return states.sort(byItemId);
  }

  async function readAllStates(): Promise<ReviewState[]> {
    const rows = await db.getAllAsync<ReviewStateRow>(
      `${SELECT_REVIEW_STATE} ORDER BY item_id`,
      [],
    );
    return rows.map(toReviewState);
  }

  async function readStreak(): Promise<Streak> {
    const row = await db.getFirstAsync<StreakRow>(
      "SELECT current, longest, last_active_date FROM streak WHERE id = 1",
      [],
    );
    if (row === null) return EMPTY_STREAK;
    return {
      current: row.current,
      longest: row.longest,
      lastActiveDate: row.last_active_date === null ? null : localDate(row.last_active_date),
    };
  }

  async function readXp(): Promise<number> {
    const row = await db.getFirstAsync<{ total: number }>("SELECT total FROM xp WHERE id = 1", []);
    return row?.total ?? 0;
  }

  async function readPlacement(): Promise<PlacementResult | null> {
    const row = await db.getFirstAsync<PlacementRow>(
      "SELECT level, theta FROM placement_result WHERE id = 1",
      [],
    );
    return row === null ? null : { level: toLevel(row.level), theta: row.theta };
  }

  async function readLessonResults(): Promise<LessonResult[]> {
    const rows = await db.getAllAsync<LessonResultRow>(
      "SELECT lesson_id, best_accuracy, completions FROM lesson_result ORDER BY lesson_id",
      [],
    );
    return rows.map((row) => ({
      lessonId: row.lesson_id,
      bestAccuracy: row.best_accuracy,
      completions: row.completions,
    }));
  }

  /** Replaces the lesson results (a handful of rows per lesson completed, so rewritten whole). */
  async function writeLessonResults(results: readonly LessonResult[]): Promise<void> {
    await db.runAsync("DELETE FROM lesson_result", []);
    for (const chunk of chunks(results, RESULTS_PER_INSERT)) {
      await db.runAsync(
        `INSERT INTO lesson_result (lesson_id, best_accuracy, completions)
         VALUES ${chunk.map(() => "(?, ?, ?)").join(", ")}`,
        chunk.flatMap((r) => [r.lessonId, r.bestAccuracy, r.completions]),
      );
    }
  }

  async function readTotals(): Promise<ProgressTotals> {
    return { xp: await readXp(), streak: await readStreak() };
  }

  async function readSyncState(key: string): Promise<string | null> {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM sync_state WHERE key = ?",
      [key],
    );
    return row?.value ?? null;
  }

  async function writeSyncState(key: string, value: string): Promise<void> {
    await db.runAsync(
      `INSERT INTO sync_state (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  async function hasEvents(): Promise<boolean> {
    return (
      (await db.getFirstAsync<{ one: number }>("SELECT 1 AS one FROM event LIMIT 1", [])) !== null
    );
  }

  async function insertEvent(
    event: StoredEvent,
    {
      ignoreExisting,
      syncedAt,
      serverSeq,
    }: {
      ignoreExisting: boolean;
      syncedAt: number | null;
      serverSeq: number | null;
    },
  ): Promise<boolean> {
    const result = (await db.runAsync(
      `INSERT ${ignoreExisting ? "OR IGNORE " : ""}INTO event
         (id, device_id, occurred_at, local_date, type, payload, synced_at, server_seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.deviceId,
        event.occurredAt,
        event.localDate,
        event.type,
        JSON.stringify(event.payload ?? null),
        syncedAt,
        serverSeq,
      ],
    )) as { changes?: number | bigint } | undefined;
    return Number(result?.changes ?? 1) > 0;
  }

  async function readEvents(order = ""): Promise<StoredEvent[]> {
    const rows = await db.getAllAsync<EventRow>(
      `SELECT id, device_id, occurred_at, local_date, type, payload FROM event ${order}`,
      [],
    );
    return rows.map(toStoredEvent);
  }

  async function upsertStates(states: readonly ReviewState[]): Promise<void> {
    for (const chunk of chunks(states, STATES_PER_INSERT)) {
      const params: SqlValue[] = chunk.flatMap((s) => [
        s.itemId,
        s.ease,
        s.intervalDays,
        s.reps,
        s.lapses,
        s.dueDate,
      ]);
      await db.runAsync(
        `INSERT INTO review_state (item_id, ease, interval_days, reps, lapses, due_date)
         VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}
         ON CONFLICT (item_id) DO UPDATE SET
           ease = excluded.ease,
           interval_days = excluded.interval_days,
           reps = excluded.reps,
           lapses = excluded.lapses,
           due_date = excluded.due_date`,
        params,
      );
    }
  }

  /** Makes the cache tables equal to `progress`, writing only the review states that changed. */
  async function writeCache(progress: ProgressState): Promise<void> {
    const cached = new Map((await readAllStates()).map((s) => [s.itemId, s]));
    const changed = progress.states.filter((s) => {
      const current = cached.get(s.itemId);
      cached.delete(s.itemId);
      return current === undefined || !sameState(current, s);
    });
    for (const chunk of chunks([...cached.keys()], MAX_IDS_PER_QUERY)) {
      await db.runAsync(
        `DELETE FROM review_state WHERE item_id IN (${chunk.map(() => "?").join(", ")})`,
        chunk,
      );
    }
    await upsertStates(changed);
    await db.runAsync(
      `INSERT INTO xp (id, total) VALUES (1, ?)
       ON CONFLICT (id) DO UPDATE SET total = excluded.total`,
      [progress.xp],
    );
    await db.runAsync(
      `INSERT INTO streak (id, current, longest, last_active_date) VALUES (1, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         current = excluded.current,
         longest = excluded.longest,
         last_active_date = excluded.last_active_date`,
      [progress.streak.current, progress.streak.longest, progress.streak.lastActiveDate],
    );
    await writeLessonResults(progress.lessonResults);
    if (progress.placement === null) {
      await db.runAsync("DELETE FROM placement_result", []);
    } else {
      await db.runAsync(
        `INSERT INTO placement_result (id, level, theta) VALUES (1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET level = excluded.level, theta = excluded.theta`,
        [progress.placement.level, progress.placement.theta],
      );
    }
  }

  async function refold(): Promise<void> {
    await writeCache(foldEvents(await readEvents()));
  }

  /** Runs `task` in a transaction and resolves to its result. */
  async function transaction<T>(task: () => Promise<T>): Promise<T> {
    let result: { value: T } | null = null;
    await db.withTransactionAsync(async () => {
      result = { value: await task() };
    });
    if (result === null) throw new Error("Transaction did not complete");
    return (result as { value: T }).value;
  }

  return {
    async getReviewStates(itemIds) {
      return itemIds === undefined ? readAllStates() : getStatesByIds(itemIds);
    },
    getStreak: readStreak,
    getXp: readXp,
    getPlacementResult: readPlacement,
    getLessonResults: readLessonResults,

    async getDeviceId() {
      const id = await readSyncState(DEVICE_ID);
      if (id === null) throw new Error("No device id yet: call ensureDeviceId first");
      return id;
    },

    async ensureDeviceId(generate) {
      return transaction(async () => {
        const stored = await readSyncState(DEVICE_ID);
        if (stored !== null) return stored;
        const id = generate();
        await writeSyncState(DEVICE_ID, id);
        return id;
      });
    },

    async ensureBaseline(build) {
      return transaction(async () => {
        if (await hasEvents()) return false;
        const cache: ProgressCache = {
          states: await readAllStates(),
          xp: await readXp(),
          streak: await readStreak(),
          placement: await readPlacement(),
        };
        const empty =
          cache.states.length === 0 &&
          cache.xp === 0 &&
          cache.streak.lastActiveDate === null &&
          cache.streak.longest === 0 &&
          cache.placement === null;
        if (empty) return false;
        const baseline = build(cache);
        assertWellFormed([baseline]);
        await insertEvent(baseline, { ignoreExisting: false, syncedAt: null, serverSeq: null });
        await refold();
        return true;
      });
    },

    async appendEvents(events): Promise<AppendedEvents> {
      assertWellFormed(events);
      return transaction(async () => {
        const before = await readTotals();
        for (const event of events) {
          await insertEvent(event, { ignoreExisting: false, syncedAt: null, serverSeq: null });
        }
        await refold();
        return { before, after: await readTotals() };
      });
    },

    async rebuildFromEvents() {
      await transaction(refold);
    },

    async getUnsyncedEvents(limit) {
      const rows = await db.getAllAsync<EventRow>(
        `SELECT id, device_id, occurred_at, local_date, type, payload FROM event
         WHERE synced_at IS NULL ORDER BY occurred_at, id LIMIT ?`,
        [limit],
      );
      return rows.map(toStoredEvent);
    },

    async markSynced(ids, serverSeqs) {
      if (ids.length !== serverSeqs.length) {
        throw new RangeError(`Got ${ids.length} ids but ${serverSeqs.length} server sequences`);
      }
      const syncedAt = now();
      await transaction(async () => {
        for (const [i, id] of ids.entries()) {
          await db.runAsync("UPDATE event SET synced_at = ?, server_seq = ? WHERE id = ?", [
            syncedAt,
            serverSeqs[i] ?? null,
            id,
          ]);
        }
      });
    },

    async replaceDeviceId(id) {
      await writeSyncState(DEVICE_ID, id);
    },

    async resetSyncState() {
      await transaction(async () => {
        await db.runAsync("UPDATE event SET synced_at = NULL, server_seq = NULL", []);
        await db.runAsync("DELETE FROM sync_state WHERE key = ?", [SERVER_CURSOR]);
      });
    },

    async clearProgress() {
      await transaction(async () => {
        await db.runAsync("DELETE FROM event", []);
        await db.runAsync("DELETE FROM sync_state WHERE key = ?", [SERVER_CURSOR]);
        await refold();
      });
    },

    async getSyncCursor() {
      return Number(await readSyncState(SERVER_CURSOR)) || 0;
    },

    async setSyncCursor(cursor) {
      if (!Number.isInteger(cursor) || cursor < 0) {
        throw new RangeError(`Sync cursor must be a non-negative integer, got ${cursor}`);
      }
      await writeSyncState(SERVER_CURSOR, String(cursor));
    },

    async getAllEvents() {
      return readEvents("ORDER BY occurred_at, id");
    },

    async importEvents(events) {
      return transaction(async () => {
        let inserted = 0;
        for (const event of events) {
          if (!isStorable(event)) continue;
          const added = await insertEvent(event, {
            ignoreExisting: true,
            syncedAt: null,
            serverSeq: null,
          });
          if (added) inserted += 1;
        }
        if (inserted > 0) await refold();
        return inserted;
      });
    },

    async insertRemoteEvents(events) {
      const syncedAt = now();
      return transaction(async () => {
        let inserted = 0;
        for (const event of events) {
          if (!isStorable(event)) continue;
          const { serverSeq, ...stored } = event;
          const added = await insertEvent(stored, {
            ignoreExisting: true,
            syncedAt,
            serverSeq: serverSeq ?? null,
          });
          if (added) inserted += 1;
        }
        if (inserted > 0) await refold();
        return inserted;
      });
    },
  };
}

/** Local writes must be events this version folds cleanly; anything else is a bug. */
function assertWellFormed(events: readonly StoredEvent[]): void {
  const { anomalies } = foldEvents(events);
  const first = anomalies[0];
  if (first !== undefined) {
    throw new RangeError(`Refusing to write an invalid event (${first.kind}: ${first.detail})`);
  }
}
