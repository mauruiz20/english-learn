import { z } from "zod";
import { NonEmptyString } from "./common";

/** Glossary ids are `glossary.<slug>`, e.g. `glossary.traffic-jam`. */
export const GLOSSARY_ID_REGEX = /^glossary\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const GlossaryIdSchema = z
  .string()
  .regex(
    GLOSSARY_ID_REGEX,
    "glossary id must look like glossary.<slug> (lowercase, digits, hyphens)",
  );

export const PARTS_OF_SPEECH = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "determiner",
  "preposition",
  "conjunction",
  "interjection",
  "auxiliary",
  "number",
  "proper noun",
  "phrasal verb",
  "expression",
] as const;

export const GlossarySenseSchema = z.strictObject({
  /** Spanish gloss: short and natural for the learner. */
  es: NonEmptyString,
  pos: z.enum(PARTS_OF_SPEECH).optional(),
});

/**
 * One headword (or phrase) with every lowercase surface form that links to it.
 * Form rules (lowercase, unique across the glossary, ...) are semantic checks.
 */
export const GlossaryEntrySchema = z.strictObject({
  id: GlossaryIdSchema,
  headword: NonEmptyString,
  kind: z.enum(["word", "phrase"]),
  forms: z.array(NonEmptyString).min(1),
  /** Most common sense first. */
  senses: z.array(GlossarySenseSchema).min(1).max(3),
});
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;
