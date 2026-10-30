import type { Exercise } from "@english-learn/content";
import {
  addDays,
  compareLocalDate,
  gradeFromOutcome,
  initialState,
  review,
  type Grade,
  type LocalDate,
  type ReviewState,
} from "@english-learn/domain";
import type { LessonSummary } from "./lesson-session";

/**
 * Time (ms) a confident learner needs for a correct answer, per exercise type. A correct answer
 * slower than this gets SM-2 grade 4 instead of 5 (see `gradeFromOutcome`).
 *
 * - vocab 8 s: read a short prompt, pick one of 3-4 single words.
 * - cloze 10 s: read one sentence, pick the word for the blank.
 * - translation_choice 12 s: read one sentence and 3-4 full-sentence translations.
 * - word_order 20 s: tap 3-10 tokens in order.
 * - translate_write 30 s: type a whole sentence on a phone keyboard.
 * - reading 60 s: read a short passage and answer every question.
 */
export const EXPECTED_MS: Readonly<Record<Exercise["type"], number>> = {
  vocab: 8_000,
  cloze: 10_000,
  translation_choice: 12_000,
  word_order: 20_000,
  translate_write: 30_000,
  reading: 60_000,
};

/** Best review grade for an item looked up before answering: "almost". */
export const LOOKED_UP_MAX_GRADE: Grade = 3;

export type ApplyLessonResultsInput = {
  readonly summary: LessonSummary;
  /** Current states of (at least) the lesson's items; other states are ignored. */
  readonly states: readonly ReviewState[];
  readonly today: LocalDate;
};

/**
 * Reviews every item the session practiced once: new items start from `initialState`, and an
 * item practiced by several exercises gets its worst grade. Returns only the practiced items'
 * states, in order of first appearance.
 *
 * An item that is not due yet (`dueDate > today`, e.g. a lesson replayed the same day) is only
 * practiced: a passing grade leaves its state unchanged, so replays cannot inflate intervals.
 * A failing grade still applies the SM-2 lapse, because forgetting is real evidence that the
 * item needs to come back sooner.
 *
 * An item the learner LOOKED UP in the glossary before answering (`outcome.lookedUp`) is capped
 * at grade 3 ("almost"): they needed help, so it should come back sooner. The cap never upgrades a
 * wrong answer (grade 1 stays 1).
 *
 * A NEW item (no state yet) answered wrong is not a lapse: the learner saw it for the first time,
 * so nothing was forgotten. It starts fresh instead (default ease, reps 0, lapses 0) and is due
 * tomorrow, like any item learned today.
 */
export function applyLessonResults({
  summary,
  states,
  today,
}: ApplyLessonResultsInput): ReviewState[] {
  const worst = new Map<string, Grade>();
  for (const outcome of summary.itemOutcomes) {
    const earned = gradeFromOutcome({
      verdict: outcome.verdict,
      responseMs: outcome.responseMs,
      expectedMs: EXPECTED_MS[outcome.exerciseType],
    });
    const grade =
      outcome.lookedUp === true ? (Math.min(earned, LOOKED_UP_MAX_GRADE) as Grade) : earned;
    const previous = worst.get(outcome.itemId);
    worst.set(
      outcome.itemId,
      previous === undefined ? grade : (Math.min(previous, grade) as Grade),
    );
  }
  const byId = new Map(states.map((s) => [s.itemId, s]));
  return [...worst].map(([itemId, grade]) => {
    const existing = byId.get(itemId);
    if (existing === undefined && grade < 3) return firstSightMiss(itemId, today);
    const current = existing ?? initialState(itemId, today);
    const notDue = compareLocalDate(current.dueDate, today) > 0;
    return notDue && grade >= 3 ? current : review(current, grade, today);
  });
}

/** State of a new item missed on first sight: untouched SM-2 values, back tomorrow. */
function firstSightMiss(itemId: string, today: LocalDate): ReviewState {
  return { ...initialState(itemId, today), intervalDays: 1, dueDate: addDays(today, 1) };
}
