import type { Verdict } from "@english-learn/domain";
import type { LessonSessionState } from "./lesson-session";

/**
 * The verdicts of the exercises answered so far, in order; while feedback is shown it includes
 * the current answer. Empty once the session is finished (its summary has them).
 */
export function sessionResults(state: LessonSessionState): readonly Verdict[] {
  return state.status === "finished" ? [] : state.answered.map((a) => a.verdict);
}

/** How many fully right answers the verdicts end with. */
export function correctInARow(verdicts: readonly Verdict[]): number {
  let count = 0;
  for (let i = verdicts.length - 1; i >= 0 && verdicts[i] === "correct"; i--) count++;
  return count;
}
