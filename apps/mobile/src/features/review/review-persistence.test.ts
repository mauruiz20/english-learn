import { corpus } from "@english-learn/content/corpus";
import type { Exercise } from "@english-learn/content";
import { addDays, localDate, type LocalDate, type ProgressRepository } from "@english-learn/domain";
import { createSqliteProgressRepository, migrate } from "@english-learn/storage-sqlite";
import { createNodeSqliteDatabase } from "@english-learn/storage-sqlite/src/testing/node-sqlite-database";
import { completeSession } from "@/features/lesson/application/complete-session";
import { lessonItemIds } from "@/features/lesson/model/lesson-catalog";
import type { LessonSummary } from "@/features/lesson/model/lesson-session";
import { createTestRandomBytes } from "@/testing/random-bytes";
import {
  REVIEW_MAX_EXERCISES_PER_DAY,
  planReview,
  reviewContext,
  restrictToItems,
  reviewOutlook,
} from "./model/review-plan";

type Db = ReturnType<typeof createNodeSqliteDatabase>;

const DAY1 = localDate("2026-11-04");
const DAY2 = addDays(DAY1, 1);
const DEVICE = "device-a";

function summaryOf(lessonId: string, exercises: readonly Exercise[], wrong = new Set<string>()) {
  const itemOutcomes = exercises.flatMap((e) =>
    e.itemIds.map((itemId) => ({
      itemId,
      exerciseType: e.type,
      verdict: wrong.has(itemId) ? ("wrong" as const) : ("correct" as const),
      responseMs: 1000,
    })),
  );
  return {
    lessonId,
    verdicts: exercises.map(() => "correct" as const),
    accuracy: 1,
    answerXp: exercises.length * 10,
    itemOutcomes,
  } satisfies LessonSummary;
}

async function save(
  repository: ProgressRepository,
  summary: LessonSummary,
  today: LocalDate,
  kind: "lesson" | "review",
  nowMs: number,
) {
  return completeSession({
    repository,
    summary,
    today,
    nowMs,
    randomBytes: createTestRandomBytes(),
    deviceId: DEVICE,
    kind,
  });
}

/** Completes lessons on `DAY1` until at least `minItems` distinct items have a state. */
async function learnLessons(repository: ProgressRepository, minItems: number) {
  const learned = new Set<string>();
  let nowMs = Date.UTC(2026, 10, 4, 9);
  for (const lesson of corpus.lessons) {
    if (learned.size >= minItems) break;
    const exercises = lesson.exerciseIds.map((id) => corpus.exercisesById.get(id)!);
    await save(repository, summaryOf(lesson.id, exercises), DAY1, "lesson", nowMs++);
    for (const id of lessonItemIds(lesson, corpus.exercisesById)) learned.add(id);
  }
  return learned.size;
}

/** The daily review as `ReviewContainer` plans and saves it. */
async function doReview(
  repository: ProgressRepository,
  today: LocalDate,
  nowMs: number,
  wrong = new Set<string>(),
) {
  const states = await repository.getReviewStates();
  const reviewed = await repository.getDailyReviewExercises(today);
  const { itemIds, exercises } = planReview({
    states,
    today,
    exercises: corpus.exercises,
    remainingExercises: Math.max(0, REVIEW_MAX_EXERCISES_PER_DAY - reviewed),
  });
  const summary = restrictToItems(summaryOf("review", exercises, wrong), itemIds);
  await save(repository, summary, today, "review", nowMs);
  return { itemIds: [...itemIds], served: exercises.length };
}

/** The items the next review will serve. */
async function pending(repository: ProgressRepository, today: LocalDate) {
  const states = await repository.getReviewStates();
  const reviewed = await repository.getDailyReviewExercises(today);
  return [
    ...planReview({
      states,
      today,
      exercises: corpus.exercises,
      remainingExercises: Math.max(0, REVIEW_MAX_EXERCISES_PER_DAY - reviewed),
    }).itemIds,
  ];
}

/** Home's count: what the next review serves, and what later reviews serve today. */
async function homeCount(repository: ProgressRepository, today: LocalDate) {
  const states = await repository.getReviewStates();
  const reviewed = await repository.getDailyReviewExercises(today);
  return reviewOutlook({
    states,
    today,
    exercises: corpus.exercises,
    remainingExercises: Math.max(0, REVIEW_MAX_EXERCISES_PER_DAY - reviewed),
  });
}

describe("a finished daily review is saved", () => {
  let db: Db;
  let repository: ProgressRepository;

  beforeEach(async () => {
    db = createNodeSqliteDatabase();
    await migrate(db);
    repository = createSqliteProgressRepository(db);
  });
  afterEach(() => db.close());

  it.each([12, 20, 45])("reviews %i due items and none of them is due again today", async (n) => {
    const learned = await learnLessons(repository, n);
    const before = await pending(repository, DAY2);
    expect(before.length).toBe(Math.min(learned, 20));
    const countBefore = await homeCount(repository, DAY2);

    const { itemIds: reviewed, served } = await doReview(
      repository,
      DAY2,
      Date.UTC(2026, 10, 5, 9),
    );

    // Home said how many the review would serve, and drops by exactly that.
    expect(served).toBe(countBefore.next);
    const countAfter = await homeCount(repository, DAY2);
    expect(countAfter.next + countAfter.later).toBe(countBefore.next + countBefore.later - served);
    const after = await pending(repository, DAY2);
    expect(after.filter((id) => reviewed.includes(id))).toEqual([]);
    // The state survives a reload (a new repository over the same database).
    const reloaded = createSqliteProgressRepository(db);
    expect(await pending(reloaded, DAY2)).toEqual(after);
  });

  it("keeps a review with lapses out of today's pending items", async () => {
    await learnLessons(repository, 30);
    const due = await pending(repository, DAY2);
    const wrong = new Set(due.slice(0, 5));
    const { itemIds: reviewed } = await doReview(repository, DAY2, Date.UTC(2026, 10, 5, 9), wrong);
    const after = await pending(repository, DAY2);
    expect(after.filter((id) => reviewed.includes(id))).toEqual([]);
  });

  it("a second review the same day reviews the next items", async () => {
    await learnLessons(repository, 60);
    const before = await homeCount(repository, DAY2);
    const first = await doReview(repository, DAY2, Date.UTC(2026, 10, 5, 9));
    const second = await doReview(repository, DAY2, Date.UTC(2026, 10, 5, 10));
    expect(second.itemIds.filter((id) => first.itemIds.includes(id))).toEqual([]);
    // The second review serves what home announced as "más después" (or the start of it).
    expect(first.served).toBe(before.next);
    expect(second.served).toBeLessThanOrEqual(before.later);
  });
});

it("prioritizes today's saved wrong answers and removes their priority after a correct retry", async () => {
  const db = createNodeSqliteDatabase();
  try {
    await migrate(db);
    const repository = createSqliteProgressRepository(db);
    const [missed, regular] = corpus.exercises
      .filter((e) => e.type === "vocab" && e.itemIds.length === 1)
      .slice(0, 2);
    if (!missed || !regular) throw new Error("Two vocabulary exercises required");
    await save(repository, summaryOf("older-lesson", [regular]), DAY1, "lesson", 1000);
    await save(
      repository,
      summaryOf("today-lesson", [missed], new Set(missed.itemIds)),
      DAY2,
      "lesson",
      2000,
    );
    const input = async () => ({
      states: await repository.getReviewStates(),
      histories: await repository.getItemHistories(),
      today: DAY2,
      exercises: [missed, regular],
      remainingExercises: 20 - (await repository.getDailyReviewExercises(DAY2)),
    });
    const first = planReview({ ...(await input()), remainingExercises: 1 });
    expect(first.itemIds).toEqual(missed.itemIds);
    await save(
      repository,
      restrictToItems(summaryOf("review", first.exercises), first.itemIds),
      DAY2,
      "review",
      3000,
    );
    expect(await repository.getDailyReviewExercises(DAY2)).toBe(1);
    expect(planReview(await input()).itemIds).toEqual(regular.itemIds);
  } finally {
    db.close();
  }
});

it("keeps yesterday's error first, then studied B2 material ahead of an older A1 backlog", async () => {
  const db = createNodeSqliteDatabase();
  try {
    await migrate(db);
    const repository = createSqliteProgressRepository(db);
    const vocabulary = corpus.exercises.filter(
      (exercise) => exercise.type === "vocab" && exercise.itemIds.length === 1,
    );
    const basic = vocabulary
      .filter((exercise) => corpus.itemsById.get(exercise.itemIds[0]!)?.level === "A1")
      .slice(0, 20);
    const [missed, advanced] = vocabulary
      .filter((exercise) => corpus.itemsById.get(exercise.itemIds[0]!)?.level === "B2")
      .slice(0, 2);
    if (!missed || !advanced || basic.length !== 20)
      throw new Error("Expected mixed-level corpus fixtures");
    await save(repository, summaryOf("old-basic", basic), addDays(DAY1, -5), "lesson", 1);
    await save(
      repository,
      summaryOf("yesterday-missed", [missed], new Set(missed.itemIds)),
      DAY1,
      "lesson",
      2,
    );
    await save(repository, summaryOf("yesterday-advanced", [advanced]), DAY1, "lesson", 3);
    const input = async () => {
      const states = await repository.getReviewStates();
      return {
        ...reviewContext(corpus, "B2", states),
        states,
        histories: await repository.getItemHistories(),
        today: DAY2,
        exercises: corpus.exercises,
        remainingExercises: 20 - (await repository.getDailyReviewExercises(DAY2)),
      };
    };
    const planned = planReview(await input());
    expect(planned.itemIds[0]).toBe(missed.itemIds[0]);
    expect(planned.itemIds.indexOf(advanced.itemIds[0]!)).toBeLessThan(
      planned.itemIds.indexOf(basic[0]!.itemIds[0]!),
    );
    const first = planReview({ ...(await input()), remainingExercises: 1 });
    await save(
      repository,
      restrictToItems(summaryOf("review", first.exercises), first.itemIds),
      DAY2,
      "review",
      4,
    );
    expect(await repository.getDailyReviewExercises(DAY2)).toBe(1);
    expect(planReview(await input()).itemIds).not.toContain(missed.itemIds[0]);
    expect(planReview(await input()).exercises.length).toBeLessThanOrEqual(19);
  } finally {
    db.close();
  }
});
