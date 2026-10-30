import { addDays, compareLocalDate, type LocalDate } from "../local-date";
import { assertGrade, initialState, review, type Grade, type ReviewState } from "./sm2";

/**
 * Applies an item's FINAL grade for one session (worst grade wins and any looked-up cap are
 * decided by the caller) to its current state. The single source of truth for how a practiced
 * item moves through SM-2:
 *
 * - New item (no state), grade ≥ 3: `review(initialState(itemId, today), grade, today)`.
 * - New item, grade < 3: first sight is not forgetting, so it starts fresh — default ease,
 *   reps 0, lapses 0 — and is due tomorrow.
 * - Existing item not due yet (`dueDate > today`, e.g. a lesson replayed the same day): practice
 *   only. A passing grade returns the state unchanged (replays cannot inflate intervals); a
 *   failing grade still applies the SM-2 lapse.
 * - Existing item due today or overdue: a normal `review`.
 */
export function applyReview(
  state: ReviewState | undefined,
  itemId: string,
  grade: Grade,
  today: LocalDate,
): ReviewState {
  assertGrade(grade);
  if (state === undefined) {
    if (grade < 3) {
      return { ...initialState(itemId, today), intervalDays: 1, dueDate: addDays(today, 1) };
    }
    return review(initialState(itemId, today), grade, today);
  }
  const notDue = compareLocalDate(state.dueDate, today) > 0;
  return notDue && grade >= 3 ? state : review(state, grade, today);
}
