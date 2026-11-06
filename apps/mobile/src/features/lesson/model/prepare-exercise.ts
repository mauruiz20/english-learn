import type {
  ClozeExercise,
  ReadingExercise,
  TranslateWriteExercise,
  TranslationChoiceExercise,
  VocabExercise,
  WordOrderExercise,
} from "@english-learn/content";
import { scrambleTokens, shuffle, shuffleChoices, type Rng } from "@english-learn/domain";
import type { ListenExercise, SessionExercise } from "./listen-exercise";

export type PreparedQuestion = { readonly prompt: string; readonly options: readonly string[] };

/** Exercise plus its render-time randomization (option order, token order). */
export type PreparedExercise =
  | {
      readonly type: "vocab";
      readonly exercise: VocabExercise;
      readonly options: readonly string[];
    }
  | {
      readonly type: "cloze";
      readonly exercise: ClozeExercise;
      readonly options: readonly string[];
    }
  | {
      readonly type: "translation_choice";
      readonly exercise: TranslationChoiceExercise;
      readonly options: readonly string[];
    }
  | {
      readonly type: "word_order";
      readonly exercise: WordOrderExercise;
      readonly tokens: readonly string[];
    }
  | {
      readonly type: "reading";
      readonly exercise: ReadingExercise;
      readonly questions: readonly PreparedQuestion[];
    }
  | { readonly type: "translate_write"; readonly exercise: TranslateWriteExercise }
  | {
      readonly type: "listen";
      readonly exercise: ListenExercise;
      /** choose: the sentences, shuffled; write: none. */
      readonly options: readonly string[];
    };

/** Shuffles options and scrambles tokens so data order never leaks the answer. */
export function prepareExercise(exercise: SessionExercise, rng: Rng): PreparedExercise {
  switch (exercise.type) {
    case "listen":
      return { type: "listen", exercise, options: shuffle(exercise.options, rng) };
    case "vocab":
    case "translation_choice": {
      const { options } = shuffleChoices(exercise, rng);
      return exercise.type === "vocab"
        ? { type: "vocab", exercise, options }
        : { type: "translation_choice", exercise, options };
    }
    case "cloze": {
      const answer = exercise.answers[0] ?? "";
      return { type: "cloze", exercise, options: shuffle([answer, ...exercise.distractors], rng) };
    }
    case "word_order":
      return { type: "word_order", exercise, tokens: scrambleTokens(exercise.tokens, rng) };
    case "reading":
      return {
        type: "reading",
        exercise,
        questions: exercise.questions.map((q) => ({
          prompt: q.prompt,
          options: shuffleChoices(q, rng).options,
        })),
      };
    case "translate_write":
      return { type: "translate_write", exercise };
  }
}
