import { z } from "zod";
import {
  AnswerIndexSchema,
  IdSchema,
  LevelSchema,
  NonEmptyString,
  OptionsSchema,
  SourceSchema,
} from "./common";

const base = {
  id: IdSchema,
  itemIds: z.array(IdSchema).min(1),
  level: LevelSchema,
  source: SourceSchema,
};

export const VocabExerciseSchema = z.strictObject({
  ...base,
  type: z.literal("vocab"),
  prompt: NonEmptyString,
  options: OptionsSchema,
  answerIndex: AnswerIndexSchema,
});

export const ClozeExerciseSchema = z.strictObject({
  ...base,
  type: z.literal("cloze"),
  /** Must contain exactly one `___` (checked by the semantic validator). */
  sentence: NonEmptyString,
  /** Accepted variants for the blank. */
  answers: z.array(NonEmptyString).min(1),
  /** Wrong choices rendered next to the answer (at least 2, so it is never a coin flip). */
  distractors: z.array(NonEmptyString).min(2),
  /** Spanish translation of the full sentence. */
  es: NonEmptyString.optional(),
});

export const WordOrderExerciseSchema = z.strictObject({
  ...base,
  type: z.literal("word_order"),
  tokens: z.array(NonEmptyString).min(3),
  accepted: z.array(NonEmptyString).min(1),
  es: NonEmptyString.optional(),
});

export const TranslationChoiceExerciseSchema = z.strictObject({
  ...base,
  type: z.literal("translation_choice"),
  /** English sentence. */
  sentence: NonEmptyString,
  /** Spanish options. */
  options: OptionsSchema,
  answerIndex: AnswerIndexSchema,
});

export const ReadingQuestionSchema = z.strictObject({
  prompt: NonEmptyString,
  options: OptionsSchema,
  answerIndex: AnswerIndexSchema,
});
export type ReadingQuestion = z.infer<typeof ReadingQuestionSchema>;

export const ReadingExerciseSchema = z.strictObject({
  ...base,
  type: z.literal("reading"),
  passageId: IdSchema,
  questions: z.array(ReadingQuestionSchema).min(1),
});

export const TranslateWriteExerciseSchema = z.strictObject({
  ...base,
  type: z.literal("translate_write"),
  /** Spanish sentence to translate. */
  es: NonEmptyString,
  /**
   * Accepted English translations as answer patterns (`{a|b}` alternatives, `[x]` optional
   * parts; see `expandPattern` in `@english-learn/domain`). The first sentence of the first
   * entry is the reference answer. Checked by the answer-pattern rule.
   */
  accepted: z.array(NonEmptyString).min(1),
});

export const ExerciseSchema = z.discriminatedUnion("type", [
  VocabExerciseSchema,
  ClozeExerciseSchema,
  WordOrderExerciseSchema,
  TranslationChoiceExerciseSchema,
  ReadingExerciseSchema,
  TranslateWriteExerciseSchema,
]);

export type VocabExercise = z.infer<typeof VocabExerciseSchema>;
export type ClozeExercise = z.infer<typeof ClozeExerciseSchema>;
export type WordOrderExercise = z.infer<typeof WordOrderExerciseSchema>;
export type TranslationChoiceExercise = z.infer<typeof TranslationChoiceExerciseSchema>;
export type ReadingExercise = z.infer<typeof ReadingExerciseSchema>;
export type TranslateWriteExercise = z.infer<typeof TranslateWriteExerciseSchema>;
export type Exercise = z.infer<typeof ExerciseSchema>;
