import type { Exercise } from "@english-learn/content";
import { gradeFromOutcome, type Grade } from "@english-learn/domain";
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

/** Review grade of an answer the learner marked as correct: correct, but never "perfect" (5). */
export const DISPUTED_GRADE: Grade = 4;

/**
 * The FINAL grade of every item the session practiced, in order of first appearance: what the
 * app writes as one `item_reviewed` event per item. How that grade moves the item through SM-2
 * (new items, first-sight misses, practice of items not due yet) is decided by the domain's
 * `applyReview` when the event log is folded.
 *
 * - An item practiced by several exercises gets its WORST grade.
 * - An answer the learner MARKED AS CORRECT (`outcome.disputed`) counts as grade 4, replacing the
 *   wrong/almost grade it had (and taking part in worst-grade-wins like any other grade).
 * - An item the learner LOOKED UP in the glossary before answering (`outcome.lookedUp`) is capped
 *   at grade 3 ("almost"): they needed help, so it should come back sooner. The cap never
 *   upgrades a wrong answer (grade 1 stays 1).
 */
export function finalGrades(summary: LessonSummary): Map<string, Grade> {
  const worst = new Map<string, Grade>();
  for (const outcome of summary.itemOutcomes) {
    const earned =
      outcome.disputed === true
        ? DISPUTED_GRADE
        : gradeFromOutcome({
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
  return worst;
}
