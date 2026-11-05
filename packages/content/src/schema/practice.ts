import { z } from "zod";
import { IdSchema, LevelSchema, NonEmptyString } from "./common";

/** Collection ids are `practice.<slug>` (`practice.phrasal-verbs`); the slug is its directory. */
export const PRACTICE_COLLECTION_ID_REGEX = /^practice\.[a-z0-9-]+$/;
/** Group ids are `practice.<collection slug>.<group slug>` (`practice.phrasal-verbs.travel`). */
export const PRACTICE_GROUP_ID_REGEX = /^practice\.[a-z0-9-]+\.[a-z0-9-]+$/;

/**
 * A group of "Práctica libre": 2 or 3 lessons on one theme. The level is a label only (nothing
 * is locked); every lesson of the group has it.
 */
export const PracticeGroupSchema = z.strictObject({
  id: z
    .string()
    .regex(PRACTICE_GROUP_ID_REGEX, "group id must look like practice.<collection>.<group>"),
  level: LevelSchema,
  /** Spanish, short (`Viajes`). */
  title: NonEmptyString,
  /** Spanish, one line. */
  summary: NonEmptyString,
  lessonIds: z.array(IdSchema).min(2).max(3),
});
export type PracticeGroup = z.infer<typeof PracticeGroupSchema>;

/**
 * A collection of "Práctica libre" (`Phrasal verbs`): its groups in display order. Practice
 * lessons are ordinary lessons kept out of the learning path. A new collection is content only:
 * `data/practice/<slug>/` with this entry and its groups' files.
 */
export const PracticeCollectionSchema = z.strictObject({
  id: z
    .string()
    .regex(PRACTICE_COLLECTION_ID_REGEX, "collection id must look like practice.<slug>"),
  /** Shown to the learner (`Phrasal verbs`, `Tiempos verbales`). */
  title: NonEmptyString,
  /** Spanish, one or two sentences. */
  summary: NonEmptyString,
  groups: z.array(PracticeGroupSchema).min(1),
});
export type PracticeCollection = z.infer<typeof PracticeCollectionSchema>;
