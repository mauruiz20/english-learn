import type { TranslationChoiceExercise } from "../schema/exercise";

export interface IntroductionCheckpointQuestion {
  readonly contextEs: string;
  readonly exercise: TranslationChoiceExercise;
}

/** Spanish situations frame the English utterances taught in lesson 002. */
export const INTRODUCTIONS_CHECKPOINT_QUESTIONS: readonly IntroductionCheckpointQuestion[] = [
  {
    contextEs: "Te presentas a una persona nueva en el trabajo.",
    exercise: {
      id: "a1.introductions.question-001",
      itemIds: ["a1.greetings.my-name-is"],
      level: "A1",
      source: { kind: "original" },
      type: "translation_choice",
      sentence: "My name is Leo.",
      options: ["Me llamo Leo.", "¿Cómo te llamas?", "Mucho gusto.", "Hasta luego."],
      answerIndex: 0,
    },
  },
  {
    contextEs: "Conoces a una persona nueva en clase y quieres preguntarle su nombre.",
    exercise: {
      id: "a1.introductions.question-002",
      itemIds: ["a1.greetings.whats-your-name"],
      level: "A1",
      source: { kind: "original" },
      type: "translation_choice",
      sentence: "What's your name?",
      options: ["¿Cómo te llamas?", "Me llamo Leo.", "Mucho gusto.", "Hasta luego."],
      answerIndex: 0,
    },
  },
  {
    contextEs: "Conoces a Ana por primera vez y quieres expresar que te da gusto conocerla.",
    exercise: {
      id: "a1.introductions.question-003",
      itemIds: ["a1.greetings.nice-to-meet-you"],
      level: "A1",
      source: { kind: "original" },
      type: "translation_choice",
      sentence: "Nice to meet you.",
      options: ["Mucho gusto.", "Me llamo Leo.", "¿Cómo te llamas?", "Hasta luego."],
      answerIndex: 0,
    },
  },
];

export const INTRODUCTIONS_CHECKPOINT_EXERCISES: readonly TranslationChoiceExercise[] =
  INTRODUCTIONS_CHECKPOINT_QUESTIONS.map(({ exercise }) => exercise);
