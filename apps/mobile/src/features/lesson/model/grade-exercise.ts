import type { Exercise } from "@english-learn/content";
import { matchAnswer, type Verdict } from "@english-learn/domain";
import type { ExerciseResponse } from "./response";

export type GradeResult = {
  readonly verdict: Verdict;
  /** The answer shown to the learner as feedback. */
  readonly correctAnswer: string;
  /** reading only: one verdict per question. */
  readonly questionVerdicts?: readonly Verdict[];
};

function mismatch(exercise: Exercise, response: ExerciseResponse): never {
  throw new TypeError(`A "${response.kind}" response cannot answer a ${exercise.type} exercise`);
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
 * - translate_write: `matchAnswer` verdict (correct / almost / wrong).
 */
export function gradeExercise(exercise: Exercise, response: ExerciseResponse): GradeResult {
  switch (exercise.type) {
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
        correctAnswer: answers.map((answer, i) => `${i + 1}. ${answer}`).join(" · "),
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
      const { verdict, closest } = matchAnswer(response.text, exercise.accepted);
      return {
        verdict,
        correctAnswer: verdict === "wrong" ? (exercise.accepted[0] ?? "") : closest,
      };
    }
  }
}
