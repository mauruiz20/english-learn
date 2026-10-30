import { z } from "zod";
import {
  ClozeExerciseSchema,
  TranslationChoiceExerciseSchema,
  VocabExerciseSchema,
} from "./exercise";
import { LevelSchema, PlacementIdSchema } from "./common";

/**
 * Placement exercises are the quick, auto-gradable exercise types. The question
 * carries the id and level, so `id`, `itemIds` and `level` are omitted here;
 * `source` is kept for attribution.
 */
const omitted = { id: true, itemIds: true, level: true } as const;

export const PlacementExerciseSchema = z.discriminatedUnion("type", [
  VocabExerciseSchema.omit(omitted),
  ClozeExerciseSchema.omit(omitted),
  TranslationChoiceExerciseSchema.omit(omitted),
]);
export type PlacementExercise = z.infer<typeof PlacementExerciseSchema>;

export const PlacementQuestionSchema = z.strictObject({
  id: PlacementIdSchema,
  level: LevelSchema,
  exercise: PlacementExerciseSchema,
});
export type PlacementQuestion = z.infer<typeof PlacementQuestionSchema>;
