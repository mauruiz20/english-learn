import {
  EMPTY_STREAK,
  RETIRED_EVENT_TYPES,
  addDays,
  foldEvents,
  foldRulesFingerprint,
  foldSnapshot,
  localDate,
  type BaselineImportedEvent,
  type Grade,
  type LocalDate,
  type ProgressEvent,
  type ReviewState,
  type StoredEvent,
  type Streak,
} from "@english-learn/domain";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "./migrations";
import {
  createSqliteProgressRepository,
  type SqliteProgressRepository,
} from "./sqlite-progress-repository";
import { createNodeSqliteDatabase } from "./testing/node-sqlite-database";

type Db = ReturnType<typeof createNodeSqliteDatabase>;

const DAY = localDate("2026-10-29");
const NEXT_DAY = localDate("2026-10-30");

let seq = 0;
/** Unique, time-ordered test ids (the fold only needs non-empty unique strings). */
function nextId(): string {
  seq += 1;
  return `0190000${String(seq).padStart(5, "0")}`;
}

function envelope(day: LocalDate, occurredAt = 1_000) {
  return { id: nextId(), deviceId: "device-a", occurredAt, localDate: day };
}

function reviewed(day: LocalDate, sessionId: string, itemId: string, grade: Grade): ProgressEvent {
  return {
    ...envelope(day),
    type: "item_reviewed",
    payload: { v: 1, sessionId, itemId, grade },
  };
}

function lessonDone(
  day: LocalDate,
  sessionId: string,
  lessonId: string,
  answerXp: number,
  accuracy = 1,
): ProgressEvent {
  return {
    ...envelope(day),
    type: "session_completed",
    payload: { v: 1, sessionId, kind: "lesson", lessonId, answerXp, accuracy },
  };
}

/** A purchase in Avi's withdrawn wardrobe, as an older app wrote it (a retired type). */
function purchased(day: LocalDate, itemId: string, price: number): StoredEvent {
  return { ...envelope(day), type: "item_purchased", payload: { v: 1, itemId, price } };
}

/** An equip in Avi's withdrawn wardrobe, as an older app wrote it (a retired type). */
function equipped(day: LocalDate, slot: string, itemId: string | null): StoredEvent {
  return { ...envelope(day), type: "item_equipped", payload: { v: 1, slot, itemId } };
}

function reviewDone(day: LocalDate, sessionId: string, answerXp: number): ProgressEvent {
  return {
    ...envelope(day),
    type: "session_completed",
    payload: { v: 1, sessionId, kind: "review", answerXp, accuracy: 1 },
  };
}

/** A finished lesson as the app writes it: one review per item plus the session. */
function lesson(
  day: LocalDate,
  lessonId: string,
  grades: Record<string, Grade>,
  answerXp: number,
): ProgressEvent[] {
  const sessionId = nextId();
  return [
    ...Object.entries(grades).map(([itemId, grade]) => reviewed(day, sessionId, itemId, grade)),
    lessonDone(day, sessionId, lessonId, answerXp),
  ];
}

function state(itemId: string, overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    itemId,
    ease: 2.5,
    intervalDays: 1,
    reps: 1,
    lapses: 0,
    dueDate: NEXT_DAY,
    ...overrides,
  };
}

/** A fresh migrated in-memory database and its repository. */
async function createSqliteNodeStore(): Promise<{ db: Db; repo: SqliteProgressRepository }> {
  const db = createNodeSqliteDatabase();
  await migrate(db);
  return { db, repo: createSqliteProgressRepository(db) };
}

async function eventCount(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM event", []);
  return row?.n ?? -1;
}

async function cacheOf(repo: SqliteProgressRepository) {
  return {
    states: await repo.getReviewStates(),
    xp: await repo.getXp(),
    streak: await repo.getStreak(),
    placement: await repo.getPlacementResult(),
    lessonResults: await repo.getLessonResults(),
  };
}

async function storedEvents(db: Db): Promise<StoredEvent[]> {
  const rows = await db.getAllAsync<{
    id: string;
    device_id: string;
    occurred_at: number;
    local_date: string;
    type: string;
    payload: string;
  }>("SELECT id, device_id, occurred_at, local_date, type, payload FROM event", []);
  return rows.map((r) => ({
    id: r.id,
    deviceId: r.device_id,
    occurredAt: r.occurred_at,
    localDate: r.local_date,
    type: r.type,
    payload: JSON.parse(r.payload) as unknown,
  }));
}

function foldedCache(events: readonly StoredEvent[]) {
  const { states, xp, streak, placement, lessonResults } = foldEvents(events);
  return { states, xp, streak, placement, lessonResults };
}

/** Creates the version 2 schema (before the event log) the way older app versions left it. */
async function seedVersion2(db: Db): Promise<void> {
  await db.execAsync(`
    CREATE TABLE review_state (item_id TEXT PRIMARY KEY NOT NULL, ease REAL NOT NULL,
      interval_days INTEGER NOT NULL, reps INTEGER NOT NULL, lapses INTEGER NOT NULL,
      due_date TEXT NOT NULL);
    CREATE TABLE streak (id INTEGER PRIMARY KEY CHECK (id = 1), current INTEGER NOT NULL,
      longest INTEGER NOT NULL, last_active_date TEXT);
    CREATE TABLE xp (id INTEGER PRIMARY KEY CHECK (id = 1), total INTEGER NOT NULL);
    CREATE TABLE placement_result (id INTEGER PRIMARY KEY CHECK (id = 1), level TEXT NOT NULL,
      theta REAL NOT NULL);
    CREATE TABLE setting (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    PRAGMA user_version = 2;
  `);
}

const baselineFor =
  (completedLessonIds: readonly string[]) =>
  (cache: Parameters<Parameters<SqliteProgressRepository["ensureBaseline"]>[0]>[0]) =>
    ({
      ...envelope(DAY, 500),
      type: "baseline_imported",
      payload: { v: 1, ...cache, completedLessonIds },
    }) satisfies BaselineImportedEvent;

describe("createSqliteProgressRepository", () => {
  let db: Db;
  let repo: SqliteProgressRepository;

  beforeEach(async () => {
    db = createNodeSqliteDatabase();
    await migrate(db);
    repo = createSqliteProgressRepository(db, { now: () => 42 });
  });
  afterEach(() => db.close());

  it("returns defaults when nothing has been stored", async () => {
    expect(await cacheOf(repo)).toEqual({
      states: [],
      xp: 0,
      streak: EMPTY_STREAK,
      placement: null,
      lessonResults: [],
    });
  });

  describe("appendEvents", () => {
    it("stores the events and serves the fold from the cache", async () => {
      const events = lesson(DAY, "l1", { b: 5, a: 2 }, 20);

      await repo.appendEvents(events);

      expect(await eventCount(db)).toBe(3);
      expect(await cacheOf(repo)).toEqual(foldedCache(events));
      expect((await repo.getReviewStates()).map((s) => s.itemId)).toEqual(["a", "b"]);
    });

    it("resolves to the totals before and after, as the fold decides them", async () => {
      const first = await repo.appendEvents(lesson(DAY, "l1", { a: 5 }, 10));
      // A replay of the same lesson earns answer XP only: the bonus is paid once per lesson.
      const replay = await repo.appendEvents(lesson(DAY, "l1", { a: 5 }, 10));

      expect(first).toEqual({
        before: { xp: 0, streak: EMPTY_STREAK },
        after: { xp: 30, streak: { current: 1, longest: 1, lastActiveDate: DAY } },
      });
      expect(replay.after.xp - replay.before.xp).toBe(10);
      expect(await repo.getXp()).toBe(40);
    });

    it("keeps the cache equal to the fold of every stored event over many sessions", async () => {
      const days = ["2026-10-01", "2026-10-02", "2026-10-02", "2026-10-05"].map(localDate);
      for (const [i, day] of days.entries()) {
        await repo.appendEvents(lesson(day, `l${i % 2}`, { a: 5, b: 3, [`c${i}`]: 1 }, 15));
        await repo.appendEvents([reviewDone(day, nextId(), 5)]);
      }
      await repo.appendEvents([
        {
          ...envelope(days[3]!),
          type: "placement_completed",
          payload: { v: 1, level: "B1", theta: 0.2 },
        },
      ]);

      const expected = foldedCache(await storedEvents(db));
      expect(expected.placement).toEqual({ level: "B1", theta: 0.2 });
      expect(await cacheOf(repo)).toEqual(expected);
    });

    it("filters review states by itemIds, also beyond SQLite's parameter limit", async () => {
      const grades = Object.fromEntries(
        Array.from({ length: 1200 }, (_, i) => [`item-${String(i).padStart(4, "0")}`, 5 as Grade]),
      );
      await repo.appendEvents(lesson(DAY, "big", grades, 0));

      expect(await repo.getReviewStates(["item-0003", "item-0001", "zzz"])).toEqual([
        expect.objectContaining({ itemId: "item-0001" }),
        expect.objectContaining({ itemId: "item-0003" }),
      ]);
      expect(await repo.getReviewStates(Object.keys(grades))).toHaveLength(1200);
      expect(await repo.getReviewStates([])).toEqual([]);
    });

    it("rejects malformed events without writing anything", async () => {
      const bad = { ...reviewDone(DAY, "s", 5), payload: { v: 1, sessionId: "s" } };

      await expect(
        repo.appendEvents([...lesson(DAY, "l1", { a: 5 }, 10), bad as ProgressEvent]),
      ).rejects.toThrow(/invalid/i);

      expect(await eventCount(db)).toBe(0);
      expect(await cacheOf(repo)).toEqual(foldedCache([]));
    });

    it("rolls back the events when refreshing the cache fails", async () => {
      await repo.appendEvents(lesson(DAY, "l1", { a: 5 }, 10));
      const before = await cacheOf(repo);
      const failing: Db = {
        ...db,
        async runAsync(source, params) {
          if (source.includes("INSERT INTO streak")) throw new Error("disk I/O error");
          return db.runAsync(source, params);
        },
      };

      await expect(
        createSqliteProgressRepository(failing).appendEvents(lesson(NEXT_DAY, "l2", { b: 5 }, 10)),
      ).rejects.toThrow("disk I/O error");

      expect(await eventCount(db)).toBe(2);
      expect(await cacheOf(repo)).toEqual(before);
    });

    it("refuses an event id that is already stored", async () => {
      const events = lesson(DAY, "l1", { a: 5 }, 10);
      await repo.appendEvents(events);

      await expect(repo.appendEvents([events[0]!])).rejects.toThrow();
      expect(await eventCount(db)).toBe(2);
    });
  });

  describe("retired wardrobe events", () => {
    it("stores synced item_purchased / item_equipped events and ignores them in the fold", async () => {
      await repo.appendEvents(lesson(DAY, "l1", { a: 5 }, 10));
      const before = await cacheOf(repo);
      const retired = [
        purchased(NEXT_DAY, "estrella", 40),
        equipped(NEXT_DAY, "sticker", "estrella"),
      ];

      expect(await repo.insertRemoteEvents(retired)).toBe(2);
      await repo.appendEvents(lesson(NEXT_DAY, "l2", { b: 5 }, 10));

      const events = await storedEvents(db);
      expect(events.map((e) => e.type)).toContain("item_purchased");
      expect(await cacheOf(repo)).toEqual(foldedCache(events));
      expect(await cacheOf(repo)).toEqual(
        foldedCache(events.filter((e) => !RETIRED_EVENT_TYPES.includes(e.type))),
      );
      expect((await cacheOf(repo)).xp).toBeGreaterThan(before.xp);
      expect(foldEvents(events).anomalies).toEqual([]);
    });
  });

  describe("lesson results", () => {
    it("caches each lesson's best result and refreshes it on every write", async () => {
      await repo.appendEvents([lessonDone(DAY, "s1", "L1", 40, 0.5)]);
      expect(await repo.getLessonResults()).toEqual([
        { lessonId: "L1", bestAccuracy: 0.5, completions: 1 },
      ]);

      await repo.appendEvents([
        lessonDone(NEXT_DAY, "s2", "L1", 60, 1),
        lessonDone(NEXT_DAY, "s3", "L0", 30, 0.75),
      ]);
      expect(await repo.getLessonResults()).toEqual([
        { lessonId: "L0", bestAccuracy: 0.75, completions: 1 },
        { lessonId: "L1", bestAccuracy: 1, completions: 2 },
      ]);
    });

    it("fills the cache of a log written before lesson results were cached", async () => {
      await repo.appendEvents([lessonDone(DAY, "s1", "L1", 40, 5 / 6)]);
      await db.runAsync("DELETE FROM lesson_result", []);
      expect(await repo.getLessonResults()).toEqual([]);

      await repo.rebuildFromEvents();

      expect(await repo.getLessonResults()).toEqual([
        { lessonId: "L1", bestAccuracy: 5 / 6, completions: 1 },
      ]);
    });

    it("clears them with the rest of the progress", async () => {
      await repo.appendEvents([lessonDone(DAY, "s1", "L1", 40, 1)]);
      await repo.clearProgress();
      expect(await repo.getLessonResults()).toEqual([]);
    });
  });

  describe("rebuildFromEvents", () => {
    it("recomputes a wiped or stale cache from the event log", async () => {
      const events = [
        ...lesson(DAY, "l1", { a: 5, b: 1 }, 20),
        ...lesson(NEXT_DAY, "l2", { b: 5, c: 4 }, 20),
      ];
      await repo.appendEvents(events);
      await db.execAsync(`
        DELETE FROM review_state;
        INSERT INTO review_state VALUES ('ghost', 2.5, 1, 1, 0, '2026-01-01');
        UPDATE xp SET total = 999;
        DELETE FROM streak;
      `);

      await repo.rebuildFromEvents();

      expect(await cacheOf(repo)).toEqual(foldedCache(events));
    });
  });

  describe("device id", () => {
    it("is generated once and then kept", async () => {
      await expect(repo.getDeviceId()).rejects.toThrow(/device id/i);
      let calls = 0;
      const generate = () => `device-${++calls}`;

      expect(await repo.ensureDeviceId(generate)).toBe("device-1");
      expect(await repo.ensureDeviceId(generate)).toBe("device-1");
      expect(await createSqliteProgressRepository(db).getDeviceId()).toBe("device-1");
      expect(calls).toBe(1);
    });
  });

  describe("ensureBaseline (upgrade from a database without events)", () => {
    const streak: Streak = { current: 4, longest: 9, lastActiveDate: localDate("2026-10-28") };
    const states = [
      state("a", {
        ease: 2.36,
        intervalDays: 6,
        reps: 2,
        lapses: 1,
        dueDate: localDate("2026-11-02"),
      }),
      state("b"),
    ];

    async function upgradedRepo(): Promise<SqliteProgressRepository> {
      const old = createNodeSqliteDatabase();
      db.close();
      db = old;
      await seedVersion2(db);
      await db.execAsync(`
        INSERT INTO review_state VALUES ('b', 2.5, 1, 1, 0, '2026-10-30');
        INSERT INTO review_state VALUES ('a', 2.36, 6, 2, 1, '2026-11-02');
        INSERT INTO xp VALUES (1, 345);
        INSERT INTO streak VALUES (1, 4, 9, '2026-10-28');
        INSERT INTO placement_result VALUES (1, 'B1', 0.3);
      `);
      await migrate(db);
      return createSqliteProgressRepository(db);
    }

    it("writes ONE baseline from the existing progress and keeps the cache identical", async () => {
      repo = await upgradedRepo();
      const before = await cacheOf(repo);
      const progress = { states, xp: 345, streak, placement: { level: "B1", theta: 0.3 } };
      expect(before).toEqual({ ...progress, lessonResults: [] });
      const seen: unknown[] = [];

      const written = await repo.ensureBaseline((cache) => {
        seen.push(cache);
        return baselineFor(["l1"])(cache);
      });
      const again = await repo.ensureBaseline(baselineFor(["l1"]));
      await migrate(db);

      expect(written).toBe(true);
      expect(again).toBe(false);
      expect(seen).toEqual([progress]);
      expect(await cacheOf(repo)).toEqual(before);
      const events = await storedEvents(db);
      expect(events.map((e) => e.type)).toEqual(["baseline_imported"]);
      expect(events[0]?.payload).toMatchObject({ completedLessonIds: ["l1"], xp: 345 });
    });

    it("keeps lessons completed before the upgrade from earning the bonus again", async () => {
      repo = await upgradedRepo();
      await repo.ensureBaseline(baselineFor(["l1"]));

      const replay = await repo.appendEvents(lesson(DAY, "l1", { a: 5 }, 10));
      const fresh = await repo.appendEvents(lesson(DAY, "l2", { a: 5 }, 10));

      expect(replay.after.xp - replay.before.xp).toBe(10);
      expect(fresh.after.xp - fresh.before.xp).toBe(30);
    });

    it("writes nothing for a learner without progress", async () => {
      expect(await repo.ensureBaseline(baselineFor([]))).toBe(false);
      expect(await eventCount(db)).toBe(0);
    });

    it("writes nothing once events exist", async () => {
      await repo.appendEvents(lesson(DAY, "l1", { a: 5 }, 10));

      expect(await repo.ensureBaseline(baselineFor([]))).toBe(false);
      expect(await eventCount(db)).toBe(2);
    });

    it("writes nothing when building the baseline fails, so it is retried next time", async () => {
      repo = await upgradedRepo();

      await expect(
        repo.ensureBaseline(() => {
          throw new Error("bug");
        }),
      ).rejects.toThrow("bug");

      expect(await eventCount(db)).toBe(0);
      expect(await repo.ensureBaseline(baselineFor([]))).toBe(true);
    });
  });

  describe("sync store", () => {
    it("lists unsynced events oldest first, up to a limit, until marked synced", async () => {
      const first = lesson(DAY, "l1", { a: 5 }, 10);
      const second = lesson(NEXT_DAY, "l2", { b: 5 }, 10);
      await repo.appendEvents(first);
      await repo.appendEvents(second);

      expect((await repo.getUnsyncedEvents(3)).map((e) => e.id)).toEqual(
        [...first, second[0]!].map((e) => e.id),
      );
      const unsynced = await repo.getUnsyncedEvents(10);
      expect(unsynced).toEqual(JSON.parse(JSON.stringify([...first, ...second])));

      await repo.markSynced(
        first.map((e) => e.id),
        [7, 8],
      );

      expect((await repo.getUnsyncedEvents(10)).map((e) => e.id)).toEqual(second.map((e) => e.id));
      const rows = await db.getAllAsync<{ synced_at: number; server_seq: number }>(
        "SELECT synced_at, server_seq FROM event WHERE synced_at IS NOT NULL ORDER BY server_seq",
        [],
      );
      expect(rows).toEqual([
        { synced_at: 42, server_seq: 7 },
        { synced_at: 42, server_seq: 8 },
      ]);
    });

    it("rejects markSynced with mismatched ids and sequences", async () => {
      await expect(repo.markSynced(["a"], [])).rejects.toThrow(RangeError);
    });

    it("keeps the server cursor", async () => {
      expect(await repo.getSyncCursor()).toBe(0);
      await repo.setSyncCursor(17);
      await repo.setSyncCursor(23);
      expect(await createSqliteProgressRepository(db).getSyncCursor()).toBe(23);
    });

    it("inserts remote events idempotently and rebuilds the cache", async () => {
      const local = lesson(DAY, "l1", { a: 5 }, 10);
      await repo.appendEvents(local);
      const remote = lesson(NEXT_DAY, "l1", { a: 5, b: 5 }, 20).map((e, i) => ({
        ...e,
        deviceId: "device-b",
        serverSeq: 100 + i,
      }));

      expect(await repo.insertRemoteEvents(remote)).toBe(3);
      expect(await repo.insertRemoteEvents([...remote, local[0]!])).toBe(0);

      const all = [...local, ...remote];
      expect(await eventCount(db)).toBe(5);
      expect(await cacheOf(repo)).toEqual(foldedCache(all));
      // Pulled events are already on the server.
      expect((await repo.getUnsyncedEvents(10)).map((e) => e.id)).toEqual(local.map((e) => e.id));
    });

    it("marks events synced without a server sequence when it is unknown", async () => {
      const events = lesson(DAY, "l1", { a: 5 }, 10);
      await repo.appendEvents(events);

      await repo.markSynced(
        events.map((e) => e.id),
        events.map(() => null),
      );

      expect(await repo.getUnsyncedEvents(10)).toEqual([]);
    });

    it("replaces the device id (a server conflict) and keeps it", async () => {
      await repo.ensureDeviceId(() => "device-1");

      await repo.replaceDeviceId("device-2");

      expect(await createSqliteProgressRepository(db).getDeviceId()).toBe("device-2");
    });

    it("resets the sync state: every event unsynced again and the cursor back to 0", async () => {
      const local = lesson(DAY, "l1", { a: 5 }, 10);
      await repo.appendEvents(local);
      await repo.markSynced(
        local.map((e) => e.id),
        [1, 2],
      );
      await repo.insertRemoteEvents(
        lesson(NEXT_DAY, "l2", { b: 5 }, 10).map((e) => ({ ...e, deviceId: "device-b" })),
      );
      await repo.setSyncCursor(9);
      const before = await cacheOf(repo);

      await repo.resetSyncState();

      expect(await repo.getSyncCursor()).toBe(0);
      expect(await repo.getUnsyncedEvents(10)).toHaveLength(4);
      expect(await cacheOf(repo)).toEqual(before);
    });

    it("clears the whole progress of this device, keeping its id", async () => {
      await repo.ensureDeviceId(() => "device-1");
      await repo.appendEvents(lesson(DAY, "l1", { a: 5 }, 10));
      await repo.setSyncCursor(9);

      await repo.clearProgress();

      expect(await eventCount(db)).toBe(0);
      expect(await cacheOf(repo)).toEqual(foldedCache([]));
      expect(await repo.getSyncCursor()).toBe(0);
      expect(await repo.getDeviceId()).toBe("device-1");
    });

    it("skips events whose id or device id is not well-formed Unicode", async () => {
      // SQLite would store a lone surrogate as U+FFFD: a refold would then see another id.
      const loneId = { ...lessonDone(DAY, "s-lone", "l1", 10), id: "abc\uD800" };
      const loneDevice = { ...lessonDone(DAY, "s-dev", "l2", 10), deviceId: "\uDC00dev" };
      const fine = lessonDone(DAY, "s-ok", "l3", 10);

      expect(await repo.insertRemoteEvents([loneId, loneDevice, fine])).toBe(1);
      expect(await repo.importEvents([loneId, loneDevice])).toBe(0);
      await expect(repo.appendEvents([loneId as ProgressEvent])).rejects.toThrow(RangeError);
      expect(await cacheOf(repo)).toEqual(foldedCache([fine]));
    });

    it("skips them too on a runtime without String.prototype.isWellFormed", async () => {
      const native = Reflect.get(String.prototype, "isWellFormed") as unknown;
      Reflect.deleteProperty(String.prototype, "isWellFormed");
      try {
        const events = [
          { ...lessonDone(DAY, "s1", "l1", 10), id: "abc\uD800" },
          { ...lessonDone(DAY, "s2", "l1", 10), id: "\uDC00abc" },
          { ...lessonDone(DAY, "s3", "l1", 10), deviceId: "a\uD800\uD800b" },
          { ...lessonDone(DAY, "s4", "l1", 10), id: "pair-😀" },
        ];
        expect(await repo.insertRemoteEvents(events)).toBe(1);
        expect((await storedEvents(db)).map((e) => e.id)).toEqual(["pair-😀"]);
      } finally {
        Reflect.defineProperty(String.prototype, "isWellFormed", {
          value: native,
          writable: true,
          configurable: true,
        });
      }
    });

    it("stores remote events this version cannot read, and skips unorderable ones", async () => {
      const future = { ...envelope(DAY), type: "goal_set", payload: { v: 1, goal: 3 } };
      const broken = { ...envelope(DAY), occurredAt: Number.NaN, type: "x", payload: {} };

      expect(await repo.insertRemoteEvents([future, broken])).toBe(1);
      expect(await cacheOf(repo)).toEqual(foldedCache([]));
    });
  });

  describe("transfer to another web origin", () => {
    it("reads every event of the log, oldest first, whatever its sync state", async () => {
      const first = lesson(DAY, "l1", { a: 5 }, 10);
      await repo.appendEvents(first);
      await repo.markSynced([first[0]!.id], [1]);
      const remote = lesson(NEXT_DAY, "l2", { b: 5 }, 10).map((e) => ({ ...e, deviceId: "b" }));
      await repo.insertRemoteEvents(remote);

      const all = await repo.getAllEvents();

      expect(all).toEqual(JSON.parse(JSON.stringify([...first, ...remote])));
    });

    it("imports missing events as unsynced local events and rebuilds the cache", async () => {
      const here = lesson(DAY, "l1", { a: 5 }, 10);
      await repo.appendEvents(here);
      await repo.markSynced(
        here.map((e) => e.id),
        [1, 2],
      );
      const moved = lesson(NEXT_DAY, "l2", { b: 5 }, 10);

      expect(await repo.importEvents([...moved, here[0]!])).toBe(2);

      expect(await eventCount(db)).toBe(4);
      expect(await cacheOf(repo)).toEqual(foldedCache([...here, ...moved]));
      // They upload with the next sync; what was already synced stays synced.
      expect((await repo.getUnsyncedEvents(10)).map((e) => e.id)).toEqual(moved.map((e) => e.id));
    });

    it("is idempotent by id", async () => {
      const moved = lesson(DAY, "l1", { a: 5 }, 10);

      expect(await repo.importEvents(moved)).toBe(2);
      expect(await repo.importEvents(moved)).toBe(0);

      expect(await eventCount(db)).toBe(2);
      expect(await repo.getXp()).toBe(30);
    });

    it("keeps events this version cannot read and skips unorderable ones", async () => {
      const future = { ...envelope(DAY), type: "goal_set", payload: { v: 1, goal: 3 } };
      const broken = { ...envelope(DAY), occurredAt: Number.NaN, type: "x", payload: {} };

      expect(await repo.importEvents([future, broken])).toBe(1);
      expect(await cacheOf(repo)).toEqual(foldedCache([]));
    });

    it("folds the old origin's baseline into a new origin's log without double XP", async () => {
      // The old origin migrated pre-event progress (one baseline: 345 XP, lesson l0 done), then
      // finished l1. The new origin started empty, so it never wrote a baseline of its own
      // (`ensureBaseline` writes none for empty progress), and finished l1 and l2 there.
      const oldLog = [
        {
          ...envelope(localDate("2026-10-01"), 1),
          type: "baseline_imported",
          payload: {
            v: 1,
            states: [state("a", { dueDate: localDate("2026-10-02") })],
            xp: 345,
            streak: { current: 2, longest: 5, lastActiveDate: localDate("2026-09-30") },
            placement: { level: "B1", theta: 0.3 },
            completedLessonIds: ["l0"],
          },
        } satisfies BaselineImportedEvent,
        ...lesson(DAY, "l0", { a: 5 }, 10), // replayed: no bonus (in the baseline)
        ...lesson(DAY, "l1", { a: 5 }, 10), // first l1 in fold order: bonus
      ];
      expect(await repo.ensureBaseline(baselineFor([]))).toBe(false);
      await repo.appendEvents(lesson(NEXT_DAY, "l1", { b: 5 }, 10)); // l1 again: no bonus
      await repo.appendEvents(lesson(NEXT_DAY, "l2", { b: 5 }, 10)); // bonus

      await repo.importEvents(oldLog);
      await repo.importEvents(oldLog);

      const all = await storedEvents(db);
      expect(all.filter((e) => e.type === "baseline_imported")).toHaveLength(1);
      expect(await repo.getXp()).toBe(345 + 10 + (10 + 20) + 10 + (10 + 20));
      expect(await cacheOf(repo)).toEqual(foldedCache(all));
      expect(await repo.getPlacementResult()).toEqual({ level: "B1", theta: 0.3 });
    });
  });

  describe("incremental fold (fold snapshot)", () => {
    /** Records every SQL statement the repository sends to the database. */
    function recording(inner: Db) {
      const statements: string[] = [];
      const record =
        <A extends unknown[], R>(run: (sql: string, ...rest: A) => R) =>
        (sql: string, ...rest: A): R => {
          statements.push(sql.replace(/\s+/g, " "));
          return run(sql, ...rest);
        };
      const db: Db = {
        ...inner,
        execAsync: record(inner.execAsync),
        runAsync: record(inner.runAsync),
        getFirstAsync: record(inner.getFirstAsync) as Db["getFirstAsync"],
        getAllAsync: record(inner.getAllAsync) as Db["getAllAsync"],
      };
      return { db, statements };
    }

    /** Statements that read whole event rows (the full log), not just a count. */
    const readsEvents = (statements: readonly string[]) =>
      statements.filter((sql) =>
        /^SELECT id, device_id.* FROM event(?! WHERE synced_at)/.test(sql),
      );

    async function storedSnapshot(target: Db = db): Promise<unknown> {
      const row = await target.getFirstAsync<{ data: string }>(
        "SELECT data FROM fold_snapshot",
        [],
      );
      return row === null ? null : (JSON.parse(row.data) as unknown);
    }

    it("saves a session without reading the event log, once a snapshot exists", async () => {
      await repo.appendEvents(lesson(DAY, "l1", { a: 5, b: 1 }, 20));
      const { db: spied, statements } = recording(db);
      const store = createSqliteProgressRepository(spied);

      await store.appendEvents(lesson(NEXT_DAY, "l2", { a: 3, c: 4 }, 30));

      expect(readsEvents(statements)).toEqual([]);
      const events = await storedEvents(db);
      expect(await cacheOf(repo)).toEqual(foldedCache(events));
      expect(await storedSnapshot()).toEqual(foldSnapshot(events));
    });

    it("pulls remote events that go after the cursor without reading the event log", async () => {
      await repo.appendEvents(lesson(DAY, "l1", { a: 5 }, 20));
      const { db: spied, statements } = recording(db);

      await createSqliteProgressRepository(spied).insertRemoteEvents(
        lesson(NEXT_DAY, "l1", { a: 4, b: 2 }, 15),
      );

      expect(readsEvents(statements)).toEqual([]);
      expect(await cacheOf(repo)).toEqual(foldedCache(await storedEvents(db)));
    });

    it("refolds the whole log when a pulled event sorts before the cursor", async () => {
      await repo.appendEvents(lesson(NEXT_DAY, "l1", { a: 5, b: 4 }, 20));
      const { db: spied, statements } = recording(db);

      // Another device did the same lesson the day before: it earns the bonus, not ours.
      await createSqliteProgressRepository(spied).insertRemoteEvents(
        lesson(DAY, "l1", { a: 1 }, 10),
      );

      expect(readsEvents(statements)).toHaveLength(1);
      const events = await storedEvents(db);
      expect(await cacheOf(repo)).toEqual(foldedCache(events));
      expect(await storedSnapshot()).toEqual(foldSnapshot(events));
    });

    it("refolds when the stored snapshot does not match the log", async () => {
      await repo.appendEvents(lesson(DAY, "l1", { a: 5 }, 20));
      // An event the snapshot never saw (no code path does this; the count catches it).
      const [stray] = lesson(DAY, "l9", { z: 5 }, 99).slice(-1);
      await db.runAsync(
        `INSERT INTO event (id, device_id, occurred_at, local_date, type, payload)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          stray!.id,
          stray!.deviceId,
          1,
          stray!.localDate,
          stray!.type,
          JSON.stringify(stray!.payload),
        ],
      );

      await repo.appendEvents(lesson(NEXT_DAY, "l2", { b: 4 }, 30));

      expect(await cacheOf(repo)).toEqual(foldedCache(await storedEvents(db)));
    });

    it("refolds once when the snapshot was stored under other fold rules (an app update)", async () => {
      await repo.appendEvents(lesson(DAY, "l1", { a: 5 }, 20));
      await db.runAsync("UPDATE fold_snapshot SET rules = 'v1-00000000'", []);
      const { db: spied, statements } = recording(db);
      const store = createSqliteProgressRepository(spied);

      await store.appendEvents(lesson(NEXT_DAY, "l2", { b: 4 }, 30));
      expect(readsEvents(statements)).toHaveLength(1);
      const row = await db.getFirstAsync<{ rules: string }>("SELECT rules FROM fold_snapshot", []);
      expect(row?.rules).toBe(foldRulesFingerprint());
      const events = await storedEvents(db);
      expect(await cacheOf(repo)).toEqual(foldedCache(events));
      expect(await storedSnapshot()).toEqual(foldSnapshot(events));

      statements.length = 0;
      await store.appendEvents(lesson(NEXT_DAY, "l3", { c: 4 }, 30));
      expect(readsEvents(statements)).toEqual([]);
    });

    it("refolds when the stored snapshot has another format version", async () => {
      await repo.appendEvents(lesson(DAY, "l1", { a: 5 }, 20));
      await db.runAsync(`UPDATE fold_snapshot SET data = '{"v":0}'`, []);

      await repo.appendEvents(lesson(NEXT_DAY, "l1", { a: 4 }, 30));

      const events = await storedEvents(db);
      expect(await cacheOf(repo)).toEqual(foldedCache(events));
      expect(await storedSnapshot()).toEqual(foldSnapshot(events));
    });

    it("rebuilds the snapshot with the cache", async () => {
      await repo.appendEvents(lesson(DAY, "l1", { a: 5 }, 20));
      await db.runAsync("DELETE FROM fold_snapshot", []);

      await repo.rebuildFromEvents();

      expect(await storedSnapshot()).toEqual(foldSnapshot(await storedEvents(db)));
    });

    it("is cleared with the rest of the progress (sign-out data deletion)", async () => {
      await repo.appendEvents(lesson(DAY, "l1", { a: 5 }, 20));

      await repo.clearProgress();

      expect(await storedSnapshot()).toBeNull();
      await repo.appendEvents(lesson(NEXT_DAY, "l2", { b: 4 }, 30));
      expect(await cacheOf(repo)).toEqual(foldedCache(await storedEvents(db)));
    });

    it("keeps the cache equal to a full refold over any mix of writes", async () => {
      const day = (n: number) => addDays(DAY, n);
      const writeArb = fc.oneof(
        fc.record({ kind: fc.constant("local" as const), day: fc.nat(6), items: fc.nat(3) }),
        fc.record({ kind: fc.constant("remote" as const), day: fc.nat(6), items: fc.nat(3) }),
        fc.record({ kind: fc.constant("import" as const), day: fc.nat(6), items: fc.nat(3) }),
        fc.record({ kind: fc.constant("redeliver" as const), pick: fc.nat(40) }),
        fc.record({
          kind: fc.constant("retired" as const),
          day: fc.nat(6),
          item: fc.constantFrom("gorra", "estrella"),
        }),
      );
      await fc.assert(
        fc.asyncProperty(fc.array(writeArb, { minLength: 1, maxLength: 8 }), async (writes) => {
          const store = await createSqliteNodeStore();
          try {
            const written: StoredEvent[] = [];
            for (const write of writes) {
              if (write.kind === "redeliver") {
                const event = written[write.pick % (written.length || 1)];
                if (event !== undefined) await store.repo.insertRemoteEvents([event]);
              } else if (write.kind === "retired") {
                const event = purchased(day(write.day), write.item, 40 + write.day);
                written.push(event);
                await store.repo.insertRemoteEvents([event]);
              } else {
                const grades = Object.fromEntries(
                  Array.from({ length: write.items + 1 }, (_, i) => [
                    `i${(i * 3 + write.day) % 5}`,
                    ((i + write.day) % 6) as Grade,
                  ]),
                );
                const events = lesson(day(write.day), `l${write.day % 3}`, grades, 10);
                written.push(...events);
                if (write.kind === "local") await store.repo.appendEvents(events);
                else if (write.kind === "remote") await store.repo.insertRemoteEvents(events);
                else await store.repo.importEvents(events);
              }
              const events = await storedEvents(store.db);
              expect(await cacheOf(store.repo)).toEqual(foldedCache(events));
              // No snapshot before the first event (nothing to fold yet).
              if (events.length > 0) {
                expect(await storedSnapshot(store.db)).toEqual(foldSnapshot(events));
              }
            }
          } finally {
            store.db.close();
          }
        }),
        { numRuns: 60 },
      );
    });
  });

  describe("performance", () => {
    // Canary for order-of-magnitude regressions (e.g. accidental quadratic refolds), not a
    // benchmark (`pnpm bench`): a few ms on a laptop, since the append folds only its own events,
    // but CI runners share CPU with the other test suites.
    it("appends a session over a 5k-event log without an order-of-magnitude slowdown", async () => {
      const start = Date.parse("2025-01-01T00:00:00Z");
      const events: ProgressEvent[] = [];
      for (let s = 0; events.length < 5_000; s++) {
        const day = localDate(
          new Date(start + Math.floor(s / 3) * 86_400_000).toISOString().slice(0, 10),
        );
        const grades = Object.fromEntries(
          Array.from({ length: 9 }, (_, i) => [
            `item-${(s * 7 + i) % 800}`,
            ((s + i) % 6) as Grade,
          ]),
        );
        events.push(...lesson(day, `lesson-${s % 120}`, grades, 60));
      }
      await repo.insertRemoteEvents(events);

      const timings: number[] = [];
      for (let run = 0; run < 3; run++) {
        const t0 = performance.now();
        await repo.appendEvents(lesson(localDate("2026-10-29"), "perf", { a: 5, b: 4, c: 3 }, 30));
        timings.push(performance.now() - t0);
      }
      const best = Math.min(...timings);
      console.info(
        `append over ${await eventCount(db)} events: ${timings.map((t) => t.toFixed(1)).join(" / ")} ms`,
      );
      expect(best).toBeLessThan(400);
      expect(await cacheOf(repo)).toEqual(foldedCache(await storedEvents(db)));
    });
  });
});
