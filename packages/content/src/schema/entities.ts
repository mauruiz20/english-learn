import { z } from "zod";
import { IdSchema, LevelSchema, NonEmptyString, SourceSchema, TopicsSchema } from "./common";

export const ItemSchema = z.strictObject({
  id: IdSchema,
  level: LevelSchema,
  topics: TopicsSchema,
  kind: z.enum(["word", "phrase", "grammar"]),
  term: NonEmptyString,
  /** Spanish gloss. */
  es: NonEmptyString,
});
export type Item = z.infer<typeof ItemSchema>;

export const PassageSchema = z.strictObject({
  id: IdSchema,
  level: LevelSchema,
  topics: TopicsSchema,
  title: NonEmptyString,
  text: NonEmptyString,
  source: SourceSchema,
});
export type Passage = z.infer<typeof PassageSchema>;

export const LessonSchema = z.strictObject({
  id: IdSchema,
  level: LevelSchema,
  topic: NonEmptyString,
  /** Spanish title shown to the learner. */
  title: NonEmptyString,
  exerciseIds: z.array(IdSchema).min(5),
  /**
   * The 3 to 5 words, phrases or structures the lesson introduces, shown in its end-of-lesson
   * recap ("Lo nuevo de hoy"). Each one is practiced by an exercise of the lesson. Optional: the
   * app derives them when absent.
   */
  newItemIds: z.array(IdSchema).min(3).max(5).optional(),
});
export type Lesson = z.infer<typeof LessonSchema>;
