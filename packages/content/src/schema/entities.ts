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
  /**
   * An English sentence that uses the item, with its Spanish translation. Optional: the app's
   * end-of-lesson recap shows it, or else takes a sentence from an exercise that practices it.
   */
  example: z.strictObject({ en: NonEmptyString, es: NonEmptyString }).optional(),
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

/**
 * A short explanation shown before a lesson starts (30–60 seconds of reading): 2–4 Spanish
 * points (English in «»), 1–2 examples and, optionally, the typical Spanish-speaker mistake.
 */
export const LessonIntroSchema = z.strictObject({
  points: z
    .array(NonEmptyString.pipe(z.string().max(140)))
    .min(2)
    .max(4),
  examples: z
    .array(z.strictObject({ en: NonEmptyString, es: NonEmptyString }))
    .min(1)
    .max(2),
  mistake: z
    .strictObject({
      wrong: NonEmptyString,
      right: NonEmptyString,
      note: NonEmptyString.pipe(z.string().max(120)),
    })
    .optional(),
});
export type LessonIntro = z.infer<typeof LessonIntroSchema>;

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
  /**
   * The 1 to 3 study cards that go deeper into what the lesson teaches, at or below its level.
   * The app shows them under the completed lesson on the path ("Profundiza") and links the
   * recap items they teach to them. Optional.
   */
  deepenCardIds: z.array(IdSchema).min(1).max(3).optional(),
  /** What the lesson teaches, shown before it starts. Optional. */
  intro: LessonIntroSchema.optional(),
});
export type Lesson = z.infer<typeof LessonSchema>;
