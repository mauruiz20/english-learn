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
 * Items the daily review practices today: due states that some reviewable exercise covers,
 * ordered by `selectSession` (most overdue, then most lapsed) and capped at `REVIEW_MAX_ITEMS`.
 * New items are never added here: they come from lessons.
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
  const plan = selectSession({
    states: states.filter((s) => byItem.has(s.itemId)),
    today,
    newItemIds: [],
    maxReviews: REVIEW_MAX_ITEMS,
    maxNew: 0,
  });
  return [...plan.reviews];
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
 * Keeps only the outcomes of `itemIds`. A review exercise may also practice items that are not
 * due; those are left untouched so their schedule does not move early.
 */
export function restrictToItems(summary: LessonSummary, itemIds: readonly string[]): LessonSummary {
  const keep = new Set(itemIds);
  return { ...summary, itemOutcomes: summary.itemOutcomes.filter((o) => keep.has(o.itemId)) };
}
