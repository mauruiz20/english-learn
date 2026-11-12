import type { Corpus, Exercise, Level } from "@english-learn/content";
import {
  LEVELS,
  selectSession,
  type ItemHistory,
  type LocalDate,
  type ReviewState,
  type Rng,
} from "@english-learn/domain";
import { autoPathLevel, isLessonDone } from "@/features/lesson/model/lesson-catalog";
import type { LessonSummary } from "@/features/lesson/model/lesson-session";

/** Most items one daily review session practices. */
export const REVIEW_MAX_ITEMS = 20;
/** Most review exercises served per local date, including later sessions. */
export const REVIEW_MAX_EXERCISES_PER_DAY = 20;

/** Reading is too long for a quick review; every other type can review an item. */
function isReviewable(exercise: Exercise): boolean {
  return exercise.type !== "reading";
}

function exercisesByItem(exercises: readonly Exercise[]): Map<string, Exercise[]> {
  const byItem = new Map<string, Exercise[]>();
  for (const exercise of exercises) {
    if (!isReviewable(exercise)) continue;
    for (const itemId of exercise.itemIds) {
      byItem.set(itemId, [...(byItem.get(itemId) ?? []), exercise]);
    }
  }
  return byItem;
}

/**
 * An item in its first steps: learned (or lapsed) at most a day ago. A lesson schedules its new
 * items for the next day; these are the reviews that keep them from being forgotten.
 */
function inFirstSteps(state: ReviewState): boolean {
  return state.intervalDays <= 1;
}

/**
 * Unresolved wrong answers (including previous days) come first. Due reviews then favor the
 * automatic path level and nearby studied levels; each band retains the existing SRS order.
 * Only stored, reviewable items are eligible: this never introduces new learning material.
 */
export function pendingReviewItems({
  states,
  today,
  exercises,
  histories = [],
  level,
  itemsById,
}: {
  states: readonly ReviewState[];
  today: LocalDate;
  exercises: readonly Exercise[];
  histories?: readonly ItemHistory[];
  level?: Level;
  itemsById?: ReadonlyMap<string, { readonly level: Level }>;
}): string[] {
  const byItem = exercisesByItem(exercises);
  const reviewable = states.filter((s) => byItem.has(s.itemId));
  const plan = (group: readonly ReviewState[]) =>
    selectSession({
      states: group,
      today,
      newItemIds: [],
      maxReviews: REVIEW_MAX_ITEMS,
      maxNew: 0,
    }).reviews;
  const known = new Set(reviewable.map((state) => state.itemId));
  // A wrong answer keeps its priority across dates until a newer non-failing answer replaces it.
  const mistakes = histories
    .filter((history) => history.lastSeen <= today && (history.recentGrades.at(-1) ?? 5) < 3)
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.itemId.localeCompare(b.itemId))
    .map((history) => history.itemId)
    .filter((itemId) => known.has(itemId));
  const rankedLevels =
    level === undefined
      ? []
      : [...LEVELS].sort(
          (a, b) =>
            Math.abs(LEVELS.indexOf(a) - LEVELS.indexOf(level)) -
              Math.abs(LEVELS.indexOf(b) - LEVELS.indexOf(level)) ||
            LEVELS.indexOf(a) - LEVELS.indexOf(b),
        );
  const itemLevel = (state: ReviewState) =>
    itemsById?.get(state.itemId)?.level ?? byItem.get(state.itemId)?.[0]?.level;
  const bands =
    itemsById && level
      ? [
          ...rankedLevels.map((candidate) =>
            reviewable.filter((state) => itemLevel(state) === candidate),
          ),
          reviewable.filter((state) => itemLevel(state) === undefined),
        ]
      : [reviewable];
  const due = bands.flatMap((band) => [
    ...plan(band.filter(inFirstSteps)),
    ...plan(band.filter((state) => !inFirstSteps(state))),
  ]);
  return [...new Set([...mistakes, ...due])].slice(0, REVIEW_MAX_ITEMS);
}

/**
 * One exercise per item, in item order. An exercise covering several of `itemIds` reviews all of
 * them, so later items it covers get no exercise of their own. Among an item's exercises, those of
 * a different type than the previous pick are preferred (variety); the rng picks among them.
 */
export function pickReviewExercises({
  itemIds,
  exercises,
  rng,
}: {
  itemIds: readonly string[];
  exercises: readonly Exercise[];
  rng: Rng;
}): Exercise[] {
  const byItem = exercisesByItem(exercises);
  const covered = new Set<string>();
  const picked: Exercise[] = [];
  for (const itemId of itemIds) {
    if (covered.has(itemId)) continue;
    const candidates = byItem.get(itemId) ?? [];
    const previousType = picked[picked.length - 1]?.type;
    const varied = candidates.filter((e) => e.type !== previousType);
    const pool = varied.length > 0 ? varied : candidates;
    const exercise = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    if (exercise === undefined) continue;
    picked.push(exercise);
    for (const id of exercise.itemIds) covered.add(id);
  }
  return picked;
}

/**
 * The rng that picks a day's review exercises: seeded by the date (Mulberry32 over an FNV-1a hash),
 * so home and the review screen plan the SAME session from the same states, and the exercises
 * still vary from day to day.
 */
export function reviewPlanRng(today: LocalDate): Rng {
  return seededRng(today);
}

/**
 * The rng that picks which of a day's review exercises are heard instead (`mixListening`): seeded
 * by the date like the plan, but apart from it, so the plan (home's count) never depends on it.
 */
export function listeningRng(today: LocalDate): Rng {
  return seededRng(`listen:${today}`);
}

/** Mulberry32 seeded with an FNV-1a hash of `text`. */
function seededRng(text: string): Rng {
  let seed = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    seed = Math.imul(seed ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export type ReviewPlanInput = {
  readonly states: readonly ReviewState[];
  readonly today: LocalDate;
  readonly exercises: readonly Exercise[];
  /** Remaining daily exercise allowance; omitted only by callers that plan a fresh day. */
  readonly remainingExercises?: number;
  readonly histories?: readonly ItemHistory[];
  readonly level?: Level;
  readonly itemsById?: ReadonlyMap<string, { readonly level: Level }>;
};

/** Use the same automatic course progression as home, not a manually browsed level. */
export function reviewContext(
  content: Corpus,
  placementLevel: Level | null,
  states: readonly ReviewState[],
) {
  const reviewed = new Set(states.map((state) => state.itemId));
  return {
    level: autoPathLevel(content.lessons, placementLevel, (lesson) =>
      isLessonDone(lesson, content.exercisesById, reviewed),
    ),
    itemsById: content.itemsById,
  };
}

export type ReviewPlan = {
  /** The items the session reviews (and saves). */
  readonly itemIds: readonly string[];
  /** The exercises it serves: one exercise may review several of `itemIds`. */
  readonly exercises: readonly Exercise[];
};

/**
 * The next daily review session: its items (`pendingReviewItems`) and its exercises, picked with
 * the day's rng (`reviewPlanRng`). Deterministic: home counts with it and `/review` plays it.
 */
export function planReview(input: ReviewPlanInput): ReviewPlan {
  const itemIds = pendingReviewItems(input);
  const exercises = pickReviewExercises({
    itemIds,
    exercises: input.exercises,
    rng: reviewPlanRng(input.today),
  }).slice(0, Math.max(0, input.remainingExercises ?? REVIEW_MAX_EXERCISES_PER_DAY));
  const coveredItems = new Set(exercises.flatMap((exercise) => exercise.itemIds));
  return { itemIds: itemIds.filter((itemId) => coveredItems.has(itemId)), exercises };
}

/**
 * What today's reviews will serve, in exercises (the unit the review screen counts): `next` is
 * the next session's size, `later` what fits the remaining allowance after it. Each planned item
 * is counted once here; after saving, a failed answer can reappear while allowance remains.
 */
export function reviewOutlook(input: ReviewPlanInput): { next: number; later: number } {
  let states = input.states;
  const sizes: number[] = [];
  let remainingExercises = Math.max(0, input.remainingExercises ?? REVIEW_MAX_EXERCISES_PER_DAY);
  while (remainingExercises > 0) {
    const plan = planReview({ ...input, states, remainingExercises });
    if (plan.exercises.length === 0) break;
    sizes.push(plan.exercises.length);
    remainingExercises -= plan.exercises.length;
    const planned = new Set(plan.itemIds);
    states = states.filter((s) => !planned.has(s.itemId));
  }
  const [next = 0, ...rest] = sizes;
  return { next, later: rest.reduce((sum, size) => sum + size, 0) };
}

/** Whether any reviewable due exercises remain after today's allowance, for tomorrow's note. */
export function hasDeferredReviewExercises(input: ReviewPlanInput): boolean {
  let states = input.states;
  let remainingExercises = Math.max(0, input.remainingExercises ?? REVIEW_MAX_EXERCISES_PER_DAY);
  while (remainingExercises > 0) {
    const plan = planReview({ ...input, states, remainingExercises });
    if (plan.exercises.length === 0) break;
    remainingExercises -= plan.exercises.length;
    const planned = new Set(plan.itemIds);
    states = states.filter((s) => !planned.has(s.itemId));
  }
  return (
    planReview({
      ...input,
      states,
      remainingExercises: REVIEW_MAX_EXERCISES_PER_DAY,
    }).exercises.length > 0
  );
}

/**
 * Keeps only the outcomes of `itemIds`. A review exercise may also practice items that are not
 * due; those are left untouched so their schedule does not move early.
 */
export function restrictToItems(summary: LessonSummary, itemIds: readonly string[]): LessonSummary {
  const keep = new Set(itemIds);
  return { ...summary, itemOutcomes: summary.itemOutcomes.filter((o) => keep.has(o.itemId)) };
}
