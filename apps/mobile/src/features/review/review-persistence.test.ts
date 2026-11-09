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
