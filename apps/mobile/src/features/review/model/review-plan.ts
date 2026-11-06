import type { Exercise } from "@english-learn/content";
import { selectSession, type LocalDate, type ReviewState, type Rng } from "@english-learn/domain";
import type { LessonSummary } from "@/features/lesson/model/lesson-session";

/** Most items one daily review session practices. */
export const REVIEW_MAX_ITEMS = 20;

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
 * Items the daily review practices today: due states that some reviewable exercise covers,
 * capped at `REVIEW_MAX_ITEMS`. Items in their first steps (interval ≤ 1 day: yesterday's new
 * lesson items, lapses) come first, so a backlog never pushes them out; within each group,
 * `selectSession` orders them (most overdue, then most lapsed). New items are never added here:
 * they come from lessons.
 */
export function pendingReviewItems({
  states,
  today,
  exercises,
}: {
  states: readonly ReviewState[];
  today: LocalDate;
  exercises: readonly Exercise[];
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
  return [
    ...plan(reviewable.filter(inFirstSteps)),
    ...plan(reviewable.filter((s) => !inFirstSteps(s))),
  ].slice(0, REVIEW_MAX_ITEMS);
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
  let seed = 0x811c9dc5;
  for (let i = 0; i < today.length; i++) {
    seed = Math.imul(seed ^ today.charCodeAt(i), 0x01000193) >>> 0;
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
};

export type ReviewPlan = {
  /** The due items the session reviews (and saves). */
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
  });
  return { itemIds, exercises };
}

/**
 * What today's reviews will serve, in exercises (the unit the review screen counts): `next` is
 * the next session's size, `later` what the sessions after it will serve today. A reviewed item
 * is never due again the same day (a pass moves it ahead, a lapse to tomorrow), so later sessions
 * plan over the due items the earlier ones left.
 */
export function reviewOutlook(input: ReviewPlanInput): { next: number; later: number } {
  let states = input.states;
  const sizes: number[] = [];
  for (;;) {
    const plan = planReview({ ...input, states });
    if (plan.exercises.length === 0) break;
    sizes.push(plan.exercises.length);
    const planned = new Set(plan.itemIds);
    states = states.filter((s) => !planned.has(s.itemId));
  }
  const [next = 0, ...rest] = sizes;
  return { next, later: rest.reduce((sum, size) => sum + size, 0) };
}

/**
 * Keeps only the outcomes of `itemIds`. A review exercise may also practice items that are not
 * due; those are left untouched so their schedule does not move early.
 */
export function restrictToItems(summary: LessonSummary, itemIds: readonly string[]): LessonSummary {
  const keep = new Set(itemIds);
  return { ...summary, itemOutcomes: summary.itemOutcomes.filter((o) => keep.has(o.itemId)) };
}
