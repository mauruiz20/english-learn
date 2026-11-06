import { vocabOptionsAreEnglish } from "./lookup-policy";
import type { PreparedExercise } from "./prepare-exercise";

/**
 * The English the feedback's speaker says once the answer is checked, or null when there is
 * none: the right sentence (word order, translate-write), the cloze sentence with its
 * gap filled, the English sentence of a translation choice (its answer is Spanish), an English
 * vocab answer, the sentence a listening exercise said. Reading has a speaker on its passage instead.
 */
export function spokenAnswer(prepared: PreparedExercise, correctAnswer: string): string | null {
  switch (prepared.type) {
    case "vocab":
      return vocabOptionsAreEnglish(prepared.exercise.prompt) ? correctAnswer : null;
    case "cloze":
      return prepared.exercise.sentence.replace("___", correctAnswer);
    case "translation_choice":
      return prepared.exercise.sentence;
    case "word_order":
    case "translate_write":
      return correctAnswer;
    case "reading":
      return null;
    case "listen":
      return prepared.exercise.sentence;
  }
}
