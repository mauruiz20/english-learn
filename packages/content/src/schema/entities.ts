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
});
export type Lesson = z.infer<typeof LessonSchema>;
