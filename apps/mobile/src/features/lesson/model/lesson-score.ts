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

/** "Perfecta · 6/6", "Completada · 5/6", or "Completada" without a recorded result. */
export function scoreText(score: LessonScore | undefined): string {
  if (score === undefined) return "Completada";
  return `${score.perfect ? "Perfecta" : "Completada"} · ${score.correct}/${score.total}`;
}

/** "completada sin errores: 6 de 6 correctas", for an accessible label after a title. */
export function scoreDescription(score: LessonScore | undefined): string {
  if (score === undefined) return "completada";
  const how = score.perfect ? "sin errores" : "con errores";
  return `completada ${how}: ${score.correct} de ${score.total} correctas`;
}
