import type { LessonResult } from "@english-learn/domain";

/** A lesson's best result as the path shows it: "5/6", and whether every answer was right. */
export type LessonScore = {
  readonly correct: number;
  readonly total: number;
  /** Every answer right (the best accuracy is 1). */
  readonly perfect: boolean;
};

/**
 * The best result of a lesson in right answers out of its `exerciseCount` (one verdict per
 * exercise). `session_completed` keeps the accuracy only, so the count is `accuracy × exercises`,
 * rounded; anything short of 1 is never shown as all right. None without a result.
 */
export function lessonScore(
  result: LessonResult | undefined,
  exerciseCount: number,
): LessonScore | undefined {
  if (result === undefined || exerciseCount <= 0) return undefined;
  const perfect = result.bestAccuracy >= 1;
  const rounded = Math.round(result.bestAccuracy * exerciseCount);
  const correct = perfect ? exerciseCount : Math.min(exerciseCount - 1, Math.max(0, rounded));
  return { correct, total: exerciseCount, perfect };
}
