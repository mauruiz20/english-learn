import { z } from "zod";
import { LevelSchema, NonEmptyString } from "./common";

/** Longest intro point (Spanish bullet), in characters. */
export const INTRO_POINT_MAX = 140;
/** Longest note of an intro's typical mistake, in characters. */
export const INTRO_MISTAKE_NOTE_MAX = 120;

const max = (limit: number) =>
  NonEmptyString.refine((s) => s.length <= limit, `must be at most ${limit} characters`);

/** An English sentence and its Spanish translation. */
const IntroExampleSchema = z.strictObject({ en: NonEmptyString, es: NonEmptyString });

/**
 * A typical Spanish-speaker mistake: `wrong` and `right` are English (they must differ), `note`
 * explains it in Spanish.
 */
export const IntroMistakeSchema = z.strictObject({
  wrong: NonEmptyString,
  right: NonEmptyString,
  note: max(INTRO_MISTAKE_NOTE_MAX),
});
export type IntroMistake = z.infer<typeof IntroMistakeSchema>;

/**
 * A lesson's short theory screen ("Antes de empezar"), 30 to 60 seconds of reading: 2 to 4
 * Spanish points (English quoted in «»), 1 or 2 examples and, optionally, the typical mistake.
 */
export const LessonIntroSchema = z.strictObject({
  points: z.array(max(INTRO_POINT_MAX)).min(2).max(4),
  examples: z.array(IntroExampleSchema).min(1).max(2),
  mistake: IntroMistakeSchema.optional(),
});
export type LessonIntro = z.infer<typeof LessonIntroSchema>;

/**
 * A level's intro (`data/<level>/level.json`), shown the first time the path shows the level:
 * its title, 3 to 5 "Al terminar podrás…" bullets and its topics, all Spanish.
 */
export const LevelIntroSchema = z.strictObject({
  level: LevelSchema,
  title: NonEmptyString,
  canDo: z.array(NonEmptyString).min(3).max(5),
  topics: z.array(NonEmptyString).min(1),
});
export type LevelIntro = z.infer<typeof LevelIntroSchema>;
