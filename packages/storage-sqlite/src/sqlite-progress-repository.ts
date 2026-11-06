import {
  EMPTY_PROGRESS,
  EMPTY_STREAK,
  FOLD_SNAPSHOT_VERSION,
  LEVELS,
  advanceFold,
  foldEvents,
  foldRulesFingerprint,
  foldSnapshot,
  localDate,
  snapshotProgress,
  type AppendedEvents,
  type BaselineImportedEvent,
  type FoldSnapshot,
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

/**
 * The event exactly as reading it back from the `event` table gives it (only the envelope's
 * columns, the payload through JSON), so the incremental fold sees what a refold would.
 */
function asStored(event: StoredEvent): StoredEvent {
  return {
    id: event.id,
    deviceId: event.deviceId,
    occurredAt: event.occurredAt,
    localDate: event.localDate,
    type: event.type,
    payload: parsePayload(JSON.stringify(event.payload ?? null)),
  };
}

function sameLessonResult(a: LessonResult, b: LessonResult): boolean {
  return a.bestAccuracy === b.bestAccuracy && a.completions === b.completions;
}

/** A stored `FoldSnapshot`, or `null` when it cannot be used (unreadable, other version). */
function parseSnapshot(text: string): FoldSnapshot | null {
  try {
    const value = JSON.parse(text) as { v?: unknown } | null;
    return value?.v === FOLD_SNAPSHOT_VERSION ? (value as FoldSnapshot) : null;
  } catch {
    return null;
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

/**
 * Whether `text` is well-formed UTF-16 (no lone surrogate). SQLite stores text as UTF-8 and turns
 * a lone surrogate into U+FFFD, so such a value would read back different from what was written.
 * `String.prototype.isWellFormed` (ES2024) when the runtime has it, else a scan.
 */
function isWellFormedText(text: string): boolean {
  const native = (text as { isWellFormed?: () => boolean }).isWellFormed;
  if (typeof native === "function") return native.call(text);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/**
 * Envelope fields the event table needs, as text SQLite reads back unchanged (the fold
 * re-validates everything on read; the payload is JSON, which escapes lone surrogates).
 */
function isStorable(event: StoredEvent): boolean {
  return (
    typeof event.id === "string" &&
    event.id.length > 0 &&
    isWellFormedText(event.id) &&
    typeof event.deviceId === "string" &&
    isWellFormedText(event.deviceId) &&
    typeof event.occurredAt === "number" &&
    Number.isFinite(event.occurredAt) &&
    typeof event.localDate === "string" &&
    isWellFormedText(event.localDate) &&
    typeof event.type === "string" &&
    isWellFormedText(event.type)
  );
}

/**
 * `ProgressRepository` (plus the sync store) backed by SQLite: an append-only `event` table is
 * the source of truth, and `review_state`, `xp`, `streak`, `placement_result` and `lesson_result`
 * cache its fold.
 * Every write applies only its new events to a stored fold snapshot (`advanceFold`), refolding the
 * whole log only when they do not go after it, in the same transaction, and writes only what
 * changed.
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

  /** Makes `lesson_result` equal to `results`, given what it holds now (`cached`). */
  async function writeLessonResults(
    results: readonly LessonResult[],
    cached: readonly LessonResult[],
  ): Promise<void> {
    const stale = new Map(cached.map((r) => [r.lessonId, r]));
    const changed = results.filter((r) => {
      const current = stale.get(r.lessonId);
      stale.delete(r.lessonId);
      return current === undefined || !sameLessonResult(current, r);
    });
    for (const chunk of chunks([...stale.keys()], MAX_IDS_PER_QUERY)) {
      await db.runAsync(
        `DELETE FROM lesson_result WHERE lesson_id IN (${chunk.map(() => "?").join(", ")})`,
        chunk,
      );
    }
    for (const chunk of chunks(changed, RESULTS_PER_INSERT)) {
      await db.runAsync(
        `INSERT INTO lesson_result (lesson_id, best_accuracy, completions)
         VALUES ${chunk.map(() => "(?, ?, ?)").join(", ")}
         ON CONFLICT (lesson_id) DO UPDATE SET
           best_accuracy = excluded.best_accuracy,
           completions = excluded.completions`,
        chunk.flatMap((r) => [r.lessonId, r.bestAccuracy, r.completions]),
      );
    }
  }

  async function readTotals(): Promise<ProgressTotals> {
    return {
      xp: await readXp(),
      streak: await readStreak(),
    };
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

  /**
   * Makes the cache tables equal to `progress`, writing only the review states and lesson
   * results that changed. `cached` is what the tables hold now when known (the previous
   * snapshot's progress); otherwise they are read.
   */
  async function writeCache(
    progress: ProgressState,
    cachedProgress: ProgressState | null,
  ): Promise<void> {
    const cached = new Map(
      (cachedProgress?.states ?? (await readAllStates())).map((s) => [s.itemId, s]),
    );
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
    await writeLessonResults(
      progress.lessonResults,
      cachedProgress?.lessonResults ?? (await readLessonResults()),
    );
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

  async function countEvents(): Promise<number> {
    const row = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM event", []);
    return Number(row?.n ?? 0);
  }

  /**
   * The stored snapshot, or `null` when it cannot be used: none, unreadable, another format
   * version, or computed with other fold rules (an app update changed them: refold once).
   */
  async function readSnapshot(): Promise<{ snapshot: FoldSnapshot; eventCount: number } | null> {
    const row = await db.getFirstAsync<{ event_count: number; rules: string; data: string }>(
      "SELECT event_count, rules, data FROM fold_snapshot WHERE id = 1",
      [],
    );
    if (row === null || row.rules !== foldRulesFingerprint()) return null;
    const snapshot = parseSnapshot(row.data);
    return snapshot === null ? null : { snapshot, eventCount: Number(row.event_count) };
  }

  async function writeSnapshot(snapshot: FoldSnapshot, eventCount: number): Promise<void> {
    await db.runAsync(
      `INSERT INTO fold_snapshot (id, event_count, rules, data) VALUES (1, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         event_count = excluded.event_count,
         rules = excluded.rules,
         data = excluded.data`,
      [eventCount, foldRulesFingerprint(), JSON.stringify(snapshot)],
    );
  }

  /** Folds the whole log: the cache and the snapshot from scratch. */
  async function refold(): Promise<void> {
    const events = await readEvents();
    const snapshot = foldSnapshot(events);
    await writeCache(snapshotProgress(snapshot), null);
    await writeSnapshot(snapshot, events.length);
  }

  /**
   * Brings the cache and the snapshot up to date after `added` (events just inserted, none of
   * whose ids was stored before) by applying only them on top of the stored snapshot. Refolds
   * the whole log when there is no usable snapshot, when it does not cover exactly the other
   * events (count), or when the new events do not go after it (`advanceFold` refuses).
   */
  async function foldAdded(added: readonly StoredEvent[]): Promise<void> {
    if (added.length === 0) return;
    const stored = await readSnapshot();
    const eventCount = await countEvents();
    const advanced =
      stored !== null && stored.eventCount + added.length === eventCount
        ? advanceFold(stored.snapshot, added.map(asStored))
        : null;
    if (stored === null || advanced === null) return refold();
    await writeCache(snapshotProgress(advanced), snapshotProgress(stored.snapshot));
    await writeSnapshot(advanced, eventCount);
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
        await foldAdded([baseline]);
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
        await foldAdded(events);
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
        await db.runAsync("DELETE FROM fold_snapshot", []);
        await writeCache(EMPTY_PROGRESS, null);
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
        const added: StoredEvent[] = [];
        for (const event of events) {
          if (!isStorable(event)) continue;
          const isNew = await insertEvent(event, {
            ignoreExisting: true,
            syncedAt: null,
            serverSeq: null,
          });
          if (isNew) added.push(event);
        }
        await foldAdded(added);
        return added.length;
      });
    },

    async insertRemoteEvents(events) {
      const syncedAt = now();
      return transaction(async () => {
        const added: StoredEvent[] = [];
        for (const event of events) {
          if (!isStorable(event)) continue;
          const { serverSeq, ...stored } = event;
          const isNew = await insertEvent(stored, {
            ignoreExisting: true,
            syncedAt,
            serverSeq: serverSeq ?? null,
          });
          if (isNew) added.push(stored);
        }
        await foldAdded(added);
        return added.length;
      });
    },
  };
}

/** Local writes must be events this version folds cleanly; anything else is a bug. */
function assertWellFormed(events: readonly StoredEvent[]): void {
  const unstorable = events.find((event) => !isStorable(event));
  if (unstorable !== undefined) {
    throw new RangeError(`Refusing to write an unstorable event (${String(unstorable.id)})`);
  }
  const { anomalies } = foldEvents(events);
  const first = anomalies[0];
  if (first !== undefined) {
    throw new RangeError(`Refusing to write an invalid event (${first.kind}: ${first.detail})`);
  }
}
