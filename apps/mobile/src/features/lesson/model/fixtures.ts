/** Small, valid content fixtures for lesson tests (never shipped: only imported by tests). */
import type {
  ClozeExercise,
  Lesson,
  Passage,
  ReadingExercise,
  TranslateWriteExercise,
  TranslationChoiceExercise,
  VocabExercise,
  WordOrderExercise,
} from "@english-learn/content";

const base = { level: "A2", source: { kind: "original" } } as const;

export const vocab: VocabExercise = {
  ...base,
  id: "a2.routine.vocab-001",
  itemIds: ["a2.routine.wake-up"],
  type: "vocab",
  prompt: "What does 'wake up' mean?",
  options: ["dormirse", "acostarse", "despertarse"],
  answerIndex: 2,
};

export const cloze: ClozeExercise = {
  ...base,
  id: "a2.routine.cloze-001",
  itemIds: ["a2.routine.breakfast"],
  type: "cloze",
  sentence: "I usually ___ breakfast at seven.",
  answers: ["have", "eat"],
  distractors: ["do", "go"],
  es: "Normalmente desayuno a las siete.",
};

export const wordOrder: WordOrderExercise = {
  ...base,
  id: "a2.routine.order-001",
  itemIds: ["a2.routine.usually", "a2.routine.wake-up"],
  type: "word_order",
  tokens: ["up", "I", "wake", "usually"],
  accepted: ["I usually wake up"],
  es: "Normalmente me despierto.",
};

export const translationChoice: TranslationChoiceExercise = {
  ...base,
  id: "a2.routine.choice-001",
  itemIds: ["a2.routine.go-to-bed"],
  type: "translation_choice",
  sentence: "She goes to bed at eleven.",
  options: ["Ella se levanta a las once.", "Ella se acuesta a las once.", "Ella come a las once."],
  answerIndex: 1,
};

export const passage: Passage = {
  ...base,
  id: "a2.routine.my-day",
  topics: ["routine"],
  title: "My day",
  text: "I wake up at six thirty. I go to work by bus.",
};

export const reading: ReadingExercise = {
  ...base,
  id: "a2.routine.reading-001",
  itemIds: ["a2.routine.commute"],
  type: "reading",
  passageId: passage.id,
  questions: [
    {
      prompt: "What time does she wake up?",
      options: ["At six", "At six thirty", "At seven"],
      answerIndex: 1,
    },
    {
      prompt: "How does she go to work?",
      options: ["By car", "By bus", "On foot"],
      answerIndex: 1,
    },
  ],
};

export const translateWrite: TranslateWriteExercise = {
  ...base,
  id: "a2.routine.write-001",
  itemIds: ["a2.routine.usually", "a2.routine.go-to-bed"],
  type: "translate_write",
  es: "Normalmente me voy a la cama a las once.",
  accepted: ["I usually go to bed at eleven.", "I usually go to bed at 11."],
};

export const allExercises = [vocab, cloze, wordOrder, translationChoice, reading, translateWrite];

export const lesson: Lesson = {
  id: "a2.routine.lesson-001",
  level: "A2",
  topic: "routine",
  title: "Mi rutina",
  exerciseIds: allExercises.map((e) => e.id),
};

/** Deterministic rng that cycles through `values` (each in [0, 1)). */
export function sequenceRng(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}
