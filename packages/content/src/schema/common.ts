import { z } from "zod";

export const LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
export const LevelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof LevelSchema>;

/**
 * Content ids are `<level>.<topic>.<slug>`, e.g. `b1.travel.although`.
 * Ids are immutable once published: learner progress references them.
 */
export const ID_REGEX = /^(a1|a2|b1|b2|c1)\.[a-z0-9-]+\.[a-z0-9-]+$/;
export const IdSchema = z
  .string()
  .regex(ID_REGEX, "id must look like <level>.<topic>.<slug> (lowercase, digits, hyphens)");

/** Placement question ids are `placement.<level>.<slug>`. */
export const PLACEMENT_ID_REGEX = /^placement\.(a1|a2|b1|b2|c1)\.[a-z0-9-]+$/;
export const PlacementIdSchema = z
  .string()
  .regex(PLACEMENT_ID_REGEX, "placement id must look like placement.<level>.<slug>");

export const TatoebaSourceSchema = z.strictObject({
  kind: z.literal("tatoeba"),
  sentenceId: z.number().int().positive(),
  author: z.string().min(1),
  license: z.literal("CC BY 2.0 FR"),
});

export const SourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("original") }),
  TatoebaSourceSchema,
]);
export type Source = z.infer<typeof SourceSchema>;

export const NonEmptyString = z.string().min(1);
export const TopicsSchema = z.array(NonEmptyString).min(1);
/** 3 to 4 answer options. */
export const OptionsSchema = z.array(NonEmptyString).min(3).max(4);
export const AnswerIndexSchema = z.number().int().min(0);
