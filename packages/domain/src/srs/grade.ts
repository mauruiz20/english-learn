import type { Verdict } from "../answer-matching";
import type { Grade } from "./sm2";

export type AnswerOutcome = {
  readonly verdict: Verdict;
  readonly responseMs: number;
  readonly expectedMs: number;
};

/**
 * Maps an answer outcome to an SM-2 grade:
 * wrong → 1, almost → 3, correct but slower than expected → 4, correct and on time → 5.
 */
export function gradeFromOutcome({ verdict, responseMs, expectedMs }: AnswerOutcome): Grade {
  if (verdict === "wrong") return 1;
  if (verdict === "almost") return 3;
  return responseMs > expectedMs ? 4 : 5;
}
