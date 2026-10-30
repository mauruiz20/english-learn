import type { Verdict } from "../answer-matching";

const XP_BY_VERDICT: Readonly<Record<Verdict, number>> = { correct: 10, almost: 5, wrong: 0 };

export const LESSON_BONUS_THRESHOLD = 0.8;

export function xpForAnswer(verdict: Verdict): number {
  return XP_BY_VERDICT[verdict];
}

/** Completion bonus: 20 XP at ≥ 80 % accuracy, 10 XP otherwise. */
export function xpForLessonCompletion(accuracyRatio: number): number {
  if (!(accuracyRatio >= 0 && accuracyRatio <= 1)) {
    throw new RangeError(`Accuracy must be within 0..1, got ${accuracyRatio}`);
  }
  return accuracyRatio >= LESSON_BONUS_THRESHOLD ? 20 : 10;
}

/** Share of fully correct answers (0..1); "almost" does not count. Empty → 0. */
export function accuracy(verdicts: readonly Verdict[]): number {
  if (verdicts.length === 0) return 0;
  return verdicts.filter((v) => v === "correct").length / verdicts.length;
}
