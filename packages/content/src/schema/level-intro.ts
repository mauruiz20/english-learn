import { z } from "zod";
import { LevelSchema, NonEmptyString } from "./common";

/** File name of a level intro: `data/<level>/level.json`. */
export const LEVEL_INTRO_FILE = "level.json";

/**
 * The intro of a level (`data/<level>/level.json`), in Spanish: a title, 3–5 "Al terminar
 * podrás…" bullets and the level's topics. It is not a content file.
 */
export const LevelIntroSchema = z.strictObject({
  level: LevelSchema,
  title: NonEmptyString,
  canDo: z.array(NonEmptyString).min(3).max(5),
  topics: z.array(NonEmptyString).min(1),
});
export type LevelIntro = z.infer<typeof LevelIntroSchema>;
