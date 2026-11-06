import {
  calqueHint,
  diffAnswer,
  expandAccepted,
  matchAnswer,
  matchPatternAnswer,
  type Verdict,
  type WordDiffOp,
} from "@english-learn/domain";
import type { SessionExercise } from "./listen-exercise";
import type { ExerciseResponse } from "./response";

export type GradeResult = {
  readonly verdict: Verdict;
  /** The answer shown to the learner as feedback. */
  readonly correctAnswer: string;
  /** reading only: one verdict per question. */
  readonly questionVerdicts?: readonly Verdict[];
  /** The learner marked their answer as correct ("Mi respuesta también es correcta"). */
  readonly disputed?: boolean;
  /** translate_write: word-level comparison of the answer with `correctAnswer`. */
  readonly diff?: readonly WordDiffOp[];
  /** translate_write: a common calque the answer shows, explained in Spanish. */
  readonly hint?: string;
};

function mismatch(exercise: SessionExercise, response: ExerciseResponse): never {
  throw new TypeError(`A "${response.kind}" response cannot answer a ${exercise.type} exercise`);
}

/** "1. At six; 2. By bus": one answer per reading question. */
export function numbered(answers: readonly string[]): string {
  return answers.map((answer, i) => `${i + 1}. ${answer}`).join("; ");
}

const verdictOf = (ok: boolean): Verdict => (ok ? "correct" : "wrong");

/**
 * Grades one response.
 *
 * - vocab / translation_choice: the chosen option equals `options[answerIndex]`.
 * - cloze: the chosen option is one of `answers` (the UI offers `answers[0]` + distractors).
 * - reading: each question is graded; the exercise is correct only if all are.
 * - word_order: tokens joined by single spaces, matched with `matchAnswer`; only "correct"
 *   counts (a near miss is a wrong order, not a typo).
 * - translate_write: `matchPatternAnswer` verdict (correct / almost / wrong) against every
 *   sentence the accepted patterns stand for; a wrong answer shows the first one. The word diff
 *   against the shown answer and a calque hint (when one applies) come along.
 * - listen: a dictation is matched like translate-write against the sentence's accepted variants
 *   (case, punctuation and contractions tolerated; a typo is almost); a wrong one shows the
 *   sentence heard. A choice is correct when the sentence heard was picked.
 */
export function gradeExercise(exercise: SessionExercise, response: ExerciseResponse): GradeResult {
  switch (exercise.type) {
    case "listen": {
      if (exercise.mode === "choose") {
        if (response.kind !== "choice") return mismatch(exercise, response);
        return {
          verdict: verdictOf(response.option === exercise.sentence),
          correctAnswer: exercise.sentence,
        };
      }
      if (response.kind !== "text") return mismatch(exercise, response);
      const match = matchAnswer(response.text, exercise.answers);
      if (match.verdict !== "wrong") {
        return { verdict: match.verdict, correctAnswer: match.closest, diff: match.diff };
      }
      return {
        verdict: "wrong",
        correctAnswer: exercise.sentence,
        diff: diffAnswer(response.text, exercise.sentence),
      };
    }
    case "vocab":
    case "translation_choice": {
      if (response.kind !== "choice") return mismatch(exercise, response);
      const correctAnswer = exercise.options[exercise.answerIndex] ?? "";
      return { verdict: verdictOf(response.option === correctAnswer), correctAnswer };
    }
    case "cloze": {
      if (response.kind !== "choice") return mismatch(exercise, response);
      return {
        verdict: verdictOf(exercise.answers.includes(response.option)),
        correctAnswer: exercise.answers[0] ?? "",
      };
    }
    case "reading": {
      if (response.kind !== "choices") return mismatch(exercise, response);
      const answers = exercise.questions.map((q) => q.options[q.answerIndex] ?? "");
      const questionVerdicts = answers.map((answer, i) =>
        verdictOf(response.options[i] === answer),
      );
      return {
        verdict: verdictOf(questionVerdicts.every((v) => v === "correct")),
        correctAnswer: numbered(answers),
        questionVerdicts,
      };
    }
    case "word_order": {
      if (response.kind !== "tokens") return mismatch(exercise, response);
      const { verdict } = matchAnswer(response.tokens.join(" "), exercise.accepted);
      return {
        verdict: verdictOf(verdict === "correct"),
        correctAnswer: exercise.accepted[0] ?? "",
      };
    }
    case "translate_write": {
      if (response.kind !== "text") return mismatch(exercise, response);
      const match = matchPatternAnswer(response.text, exercise.accepted);
      const { verdict, closest } = match;
      const correctAnswer =
        verdict === "wrong" ? (expandAccepted(exercise.accepted)[0] ?? "") : closest;
      const diff =
        correctAnswer === closest ? match.diff : diffAnswer(response.text, correctAnswer);
      const hint = correctAnswer === closest ? match.hint : calqueHint(diff);
      return hint === undefined
        ? { verdict, correctAnswer, diff }
        : { verdict, correctAnswer, diff, hint };
    }
  }
}
