import { addDays, type LocalDate } from "../local-date";

/** SM-2 recall quality: 0-2 = failed recall (lapse), 3-5 = successful recall. */
export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

export type ReviewState = {
  readonly itemId: string;
  readonly ease: number;
  readonly intervalDays: number;
  readonly reps: number;
  readonly lapses: number;
  readonly dueDate: LocalDate;
};

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;

export function initialState(itemId: string, today: LocalDate): ReviewState {
  return { itemId, ease: DEFAULT_EASE, intervalDays: 0, reps: 0, lapses: 0, dueDate: today };
}

export function assertGrade(grade: number): asserts grade is Grade {
  if (!Number.isInteger(grade) || grade < 0 || grade > 5) {
    throw new RangeError(`Grade must be an integer 0..5, got ${grade}`);
  }
}

/** SM-2 ease update, floored at MIN_EASE. */
function nextEase(ease: number, grade: Grade): number {
  const miss = 5 - grade;
  return Math.max(MIN_EASE, ease + (0.1 - miss * (0.08 + miss * 0.02)));
}

/**
 * Applies one SM-2 review.
 *
 * - grade < 3: lapse — reps reset to 0, interval 1 day, lapses + 1.
 * - grade >= 3: reps + 1; interval 1 (first), 6 (second), then round(interval * ease)
 *   using the ease from *before* this review (classic SM-2 ordering).
 * - Ease is updated on every grade, including lapses (as in the original SM-2 paper),
 *   so repeatedly failed items become harder to grow; it never drops below 1.3.
 */
export function review(state: ReviewState, grade: Grade, today: LocalDate): ReviewState {
  assertGrade(grade);
  const ease = nextEase(state.ease, grade);

  if (grade < 3) {
    return {
      ...state,
      ease,
      reps: 0,
      intervalDays: 1,
      lapses: state.lapses + 1,
      dueDate: addDays(today, 1),
    };
  }

  const reps = state.reps + 1;
  const intervalDays =
    reps === 1 ? 1 : reps === 2 ? 6 : Math.round(state.intervalDays * state.ease);
  return { ...state, ease, reps, intervalDays, dueDate: addDays(today, intervalDays) };
}
