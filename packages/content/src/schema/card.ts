import { z } from "zod";
import { IdSchema, LevelSchema, NonEmptyString } from "./common";

/**
 * Study cards ("Fichas"): a short explanation of one grammar point, a group of
 * phrasal verbs or a vocabulary point, with the items it teaches (for SRS) and
 * the exercises that practice it. Each kind lives in its own topic file,
 * `data/<level>/<topic>.json`.
 */
export const CARD_TOPIC_BY_KIND = {
  grammar: "grammar",
  phrasal_verbs: "phrasal-verbs",
  vocabulary: "vocabulary",
} as const;
export type CardKind = keyof typeof CARD_TOPIC_BY_KIND;
export type CardTopic = (typeof CARD_TOPIC_BY_KIND)[CardKind];
export const CARD_KINDS = Object.keys(CARD_TOPIC_BY_KIND) as readonly CardKind[];
export const CARD_TOPICS = Object.values(CARD_TOPIC_BY_KIND) as readonly CardTopic[];

/** An English sentence and its Spanish translation. */
export const CardExampleSchema = z.strictObject({ en: NonEmptyString, es: NonEmptyString });
export type CardExample = z.infer<typeof CardExampleSchema>;

/** A typical Spanish-speaker mistake: `wrong` and `right` are English, `why` is Spanish. */
export const CardPitfallSchema = z.strictObject({
  wrong: NonEmptyString,
  right: NonEmptyString,
  why: NonEmptyString,
});
export type CardPitfall = z.infer<typeof CardPitfallSchema>;

/** One phrasal verb of a phrasal-verb card. */
export const PhrasalVerbEntrySchema = z.strictObject({
  verb: NonEmptyString,
  /** Spanish meaning. */
  es: NonEmptyString,
  /** True when the object can go between the verb and the particle (`turn it off`). */
  separable: z.boolean(),
  example: CardExampleSchema,
});
export type PhrasalVerbEntry = z.infer<typeof PhrasalVerbEntrySchema>;

/** An English word that looks like a Spanish one but means something else. */
export const FalseFriendSchema = z.strictObject({
  /** The English word (`actually`). */
  en: NonEmptyString,
  /** The Spanish word it looks like (`actualmente`). */
  looksLike: NonEmptyString,
  /** What it actually means, in Spanish (`en realidad`). */
  actually: NonEmptyString,
});
export type FalseFriend = z.infer<typeof FalseFriendSchema>;

const base = {
  id: IdSchema,
  level: LevelSchema,
  /** Spanish, short. */
  title: NonEmptyString,
  /** Spanish, one or two sentences. */
  summary: NonEmptyString,
  /** The pattern (`look forward to + verbo-ing`), or a short note. */
  form: NonEmptyString,
  /** Spanish bullet points. */
  uses: z.array(NonEmptyString).min(1).max(4),
  pitfalls: z.array(CardPitfallSchema).max(4),
  examples: z.array(CardExampleSchema).min(4).max(8),
  /** Items the card teaches; the learner reviews them with SRS. */
  itemIds: z.array(IdSchema).min(1),
  /** Practice exercises (same level and topic as the card). */
  exerciseIds: z.array(IdSchema).min(6).max(8),
};

export const GrammarCardSchema = z.strictObject({
  ...base,
  kind: z.literal("grammar"),
  topic: z.literal(CARD_TOPIC_BY_KIND.grammar),
});

export const PhrasalVerbCardSchema = z.strictObject({
  ...base,
  kind: z.literal("phrasal_verbs"),
  topic: z.literal(CARD_TOPIC_BY_KIND.phrasal_verbs),
  entries: z.array(PhrasalVerbEntrySchema).min(3).max(6),
});

export const VocabularyCardSchema = z.strictObject({
  ...base,
  kind: z.literal("vocabulary"),
  topic: z.literal(CARD_TOPIC_BY_KIND.vocabulary),
  collocations: z.array(CardExampleSchema).min(1).max(8).optional(),
  falseFriend: FalseFriendSchema.optional(),
});

export const CardSchema = z.discriminatedUnion("kind", [
  GrammarCardSchema,
  PhrasalVerbCardSchema,
  VocabularyCardSchema,
]);
export type GrammarCard = z.infer<typeof GrammarCardSchema>;
export type PhrasalVerbCard = z.infer<typeof PhrasalVerbCardSchema>;
export type VocabularyCard = z.infer<typeof VocabularyCardSchema>;
export type Card = z.infer<typeof CardSchema>;
