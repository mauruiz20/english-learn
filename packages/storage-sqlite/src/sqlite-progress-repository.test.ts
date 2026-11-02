import {
  EMPTY_STREAK,
  foldEvents,
  localDate,
  type BaselineImportedEvent,
  type Grade,
  type LocalDate,
  type ProgressEvent,
  type ReviewState,
  type StoredEvent,
  type Streak,
} from "@english-learn/domain";
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
  const { states, xp, streak, placement } = foldEvents(events);
  return { states, xp, streak, placement };
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
      expect(before).toEqual({ states, xp: 345, streak, placement: { level: "B1", theta: 0.3 } });
      const seen: unknown[] = [];

      const written = await repo.ensureBaseline((cache) => {
        seen.push(cache);
        return baselineFor(["l1"])(cache);
      });
      const again = await repo.ensureBaseline(baselineFor(["l1"]));
      await migrate(db);

      expect(written).toBe(true);
      expect(again).toBe(false);
      expect(seen).toEqual([before]);
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

  describe("performance", () => {
    // Canary for order-of-magnitude regressions (e.g. accidental quadratic refolds), not a
    // benchmark: ~25 ms on a laptop, but CI runners share CPU with the other test suites.
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
        `append+refold over ${await eventCount(db)} events: ${timings.map((t) => t.toFixed(1)).join(" / ")} ms`,
      );
      expect(best).toBeLessThan(400);
      expect(await cacheOf(repo)).toEqual(foldedCache(await storedEvents(db)));
    });
  });
});
