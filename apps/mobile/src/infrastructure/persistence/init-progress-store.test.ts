import { corpus } from "@english-learn/content/corpus";
import { localDate, type Clock, type ReviewState } from "@english-learn/domain";
import { createSqliteProgressRepository, migrate } from "@english-learn/storage-sqlite";
import { createNodeSqliteDatabase } from "@english-learn/storage-sqlite/src/testing/node-sqlite-database";
import { completeSession } from "@/features/lesson/application/complete-session";
import { lessonItemIds } from "@/features/lesson/model/lesson-catalog";
import type { LessonSummary } from "@/features/lesson/model/lesson-session";
import { createTestRandomBytes } from "@/testing/random-bytes";
import { initProgressStore } from "./init-progress-store";

const TODAY = localDate("2026-10-29");
const clock: Clock = { today: () => TODAY, nowMs: () => Date.UTC(2026, 9, 29, 9) };
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Db = ReturnType<typeof createNodeSqliteDatabase>;

const [doneLesson, otherLesson] = (() => {
  const first = corpus.lessons[0]!;
  const firstItems = new Set(lessonItemIds(first, corpus.exercisesById));
  const other = corpus.lessons.find((l) =>
    lessonItemIds(l, corpus.exercisesById).some((id) => !firstItems.has(id)),
  )!;
  return [first, other];
})();

function learned(itemId: string): ReviewState {
  return {
    itemId,
    ease: 2.5,
    intervalDays: 1,
    reps: 1,
    lapses: 0,
    dueDate: localDate("2026-10-30"),
  };
}

/** A database as the app left it before the event log (schema version 2) with progress. */
async function seedPreEventDatabase(db: Db): Promise<void> {
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
    INSERT INTO xp VALUES (1, 210);
    INSERT INTO streak VALUES (1, 2, 6, '2026-10-28');
    INSERT INTO placement_result VALUES (1, 'A2', -0.7);
    PRAGMA user_version = 2;
  `);
  // Every item of `doneLesson`, and one item of `otherLesson` it does not share.
  const doneItems = lessonItemIds(doneLesson, corpus.exercisesById);
  const extra = lessonItemIds(otherLesson, corpus.exercisesById).find(
    (id) => !doneItems.includes(id),
  )!;
  for (const state of [...doneItems, extra].map(learned)) {
    await db.runAsync("INSERT INTO review_state VALUES (?, ?, ?, ?, ?, ?)", [
      state.itemId,
      state.ease,
      state.intervalDays,
      state.reps,
      state.lapses,
      state.dueDate,
    ]);
  }
}

async function cacheOf(repo: Awaited<ReturnType<typeof initProgressStore>>) {
  return {
    states: await repo.getReviewStates(),
    xp: await repo.getXp(),
    streak: await repo.getStreak(),
    placement: await repo.getPlacementResult(),
  };
}

async function eventTypes(db: Db): Promise<string[]> {
  const rows = await db.getAllAsync<{ type: string }>("SELECT type FROM event ORDER BY rowid", []);
  return rows.map((r) => r.type);
}

function lessonSummary(lessonId: string, itemIds: readonly string[]): LessonSummary {
  return {
    lessonId,
    verdicts: itemIds.map(() => "correct"),
    accuracy: 1,
    answerXp: itemIds.length * 10,
    itemOutcomes: itemIds.map((itemId) => ({
      itemId,
      exerciseType: "vocab",
      verdict: "correct",
      responseMs: 1000,
    })),
  };
}

describe("initProgressStore (upgrade to the event log)", () => {
  let db: Db;
  const options = { clock, randomBytes: createTestRandomBytes(), content: corpus };

  beforeEach(() => {
    db = createNodeSqliteDatabase();
  });
  afterEach(() => db.close());

  it("keeps an existing learner's progress identical and writes one baseline", async () => {
    await seedPreEventDatabase(db);
    await migrate(db);
    const before = await cacheOf(createSqliteProgressRepository(db));

    const repo = await initProgressStore(db, options);
    const again = await initProgressStore(db, options);

    expect(await cacheOf(repo)).toEqual(before);
    expect(await cacheOf(again)).toEqual(before);
    expect(before.xp).toBe(210);
    expect(await eventTypes(db)).toEqual(["baseline_imported"]);
    const row = await db.getFirstAsync<{ device_id: string; payload: string }>(
      "SELECT device_id, payload FROM event",
      [],
    );
    const deviceId = await repo.getDeviceId();
    expect(deviceId).toMatch(UUID_V7);
    expect(await again.getDeviceId()).toBe(deviceId);
    expect(row?.device_id).toBe(deviceId);
    const payload = JSON.parse(row!.payload) as { completedLessonIds: string[] };
    expect(payload.completedLessonIds).toContain(doneLesson.id);
    expect(payload.completedLessonIds).not.toContain(otherLesson.id);
  });

  it("does not pay the bonus again for lessons done before the upgrade", async () => {
    await seedPreEventDatabase(db);
    const repo = await initProgressStore(db, options);
    const session = {
      repository: repo,
      today: TODAY,
      nowMs: clock.nowMs(),
      randomBytes: options.randomBytes,
      deviceId: await repo.getDeviceId(),
    };

    const replay = await completeSession({
      ...session,
      summary: lessonSummary(doneLesson.id, lessonItemIds(doneLesson, corpus.exercisesById)),
      kind: "lesson",
    });
    const first = await completeSession({
      ...session,
      summary: lessonSummary(otherLesson.id, lessonItemIds(otherLesson, corpus.exercisesById)),
      kind: "lesson",
    });

    expect(replay.xpEarned).toBe(lessonItemIds(doneLesson, corpus.exercisesById).length * 10);
    expect(first.xpEarned).toBe(lessonItemIds(otherLesson, corpus.exercisesById).length * 10 + 20);
  });

  it("fills the lesson results of a log from before they were cached", async () => {
    const repo = await initProgressStore(db, options);
    await completeSession({
      repository: repo,
      today: TODAY,
      nowMs: clock.nowMs(),
      randomBytes: options.randomBytes,
      deviceId: await repo.getDeviceId(),
      summary: lessonSummary(doneLesson.id, ["a2.daily-routine.wake-up"]),
      kind: "lesson",
    });
    // As an app version before the lesson result cache left it: schema 3, no lesson_result (nor
    // the later fold_snapshot and item_history).
    await db.execAsync(
      "DROP TABLE lesson_result; DROP TABLE fold_snapshot; DROP TABLE item_history; DROP TABLE daily_exercises; PRAGMA user_version = 3;",
    );

    const upgraded = await initProgressStore(db, options);

    expect(await upgraded.getLessonResults()).toEqual([
      { lessonId: doneLesson.id, bestAccuracy: 1, completions: 1 },
    ]);
  });

  it("fills the item history of a log from before it was cached", async () => {
    const repo = await initProgressStore(db, options);
    await completeSession({
      repository: repo,
      today: TODAY,
      nowMs: clock.nowMs(),
      randomBytes: options.randomBytes,
      deviceId: await repo.getDeviceId(),
      summary: lessonSummary(doneLesson.id, ["a2.daily-routine.wake-up"]),
      kind: "lesson",
    });
    // As the previous app version left it: schema 7, no item_history.
    await db.execAsync(
      "DROP TABLE item_history; DROP TABLE daily_exercises; PRAGMA user_version = 7;",
    );

    const upgraded = await initProgressStore(db, options);

    expect(await upgraded.getItemHistories()).toEqual([
      expect.objectContaining({ itemId: "a2.daily-routine.wake-up", lastSeen: TODAY }),
    ]);
  });

  it("writes no baseline on a fresh install, only the device id", async () => {
    const repo = await initProgressStore(db, options);

    expect(await eventTypes(db)).toEqual([]);
    expect(await repo.getDeviceId()).toMatch(UUID_V7);
    expect(await repo.getXp()).toBe(0);
  });
});
