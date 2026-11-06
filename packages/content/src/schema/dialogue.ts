import { z } from "zod";
import { IdSchema, LevelSchema, NonEmptyString } from "./common";

/**
 * Interactive dialogues ("Diálogos", a "Práctica libre" collection): a graph of turns. The other
 * character speaks (an `npc` line in English with its Spanish gloss), and the learner replies by
 * choosing among 2–4 rated replies (`choose`) or by writing one (`write`, graded with answer
 * patterns). Replies lead to different nodes, so the character reacts to how the learner spoke;
 * every path reaches an `end`. The graph rules live in `validate/dialogues.ts`.
 */

/** Node and character ids inside one dialogue (`n1`, `t2`, `end-polite`, `agent`). */
export const DIALOGUE_LOCAL_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LocalId = z
  .string()
  .regex(DIALOGUE_LOCAL_ID_REGEX, "must be lowercase letters, digits and single hyphens");

/** How a reply sounds: good, ok (understood, but blunt or unnatural) or wrong. */
export const DIALOGUE_RATINGS = ["good", "ok", "wrong"] as const;
export const DialogueRatingSchema = z.enum(DIALOGUE_RATINGS);
export type DialogueRating = z.infer<typeof DialogueRatingSchema>;

export const DialogueCharacterSchema = z.strictObject({
  id: LocalId,
  /** Shown above the character's lines (`Laura`, `Recepción`). */
  name: NonEmptyString,
  /** Spanish (`agente de la aerolínea`). */
  role: NonEmptyString,
});
export type DialogueCharacter = z.infer<typeof DialogueCharacterSchema>;

/** The items a learner turn practices: they enter spaced repetition graded by the reply. */
const TurnItemIds = z.array(IdSchema).min(1).optional();

export const DialogueNpcNodeSchema = z.strictObject({
  id: LocalId,
  kind: z.literal("npc"),
  /** A character id. */
  speaker: LocalId,
  en: NonEmptyString,
  /** Spanish gloss, shown on demand. */
  es: NonEmptyString,
  next: LocalId,
});

export const DialogueOptionSchema = z.strictObject({
  en: NonEmptyString,
  rating: DialogueRatingSchema,
  /** Spanish: why the reply works or not (register, rudeness, misunderstanding). */
  feedback: NonEmptyString,
  next: LocalId,
});
export type DialogueOption = z.infer<typeof DialogueOptionSchema>;

export const DialogueChooseNodeSchema = z.strictObject({
  id: LocalId,
  kind: z.literal("choose"),
  itemIds: TurnItemIds,
  options: z.array(DialogueOptionSchema).min(2).max(4),
});

export const DialogueWriteNodeSchema = z.strictObject({
  id: LocalId,
  kind: z.literal("write"),
  itemIds: TurnItemIds,
  /** Spanish: what to say (`Pide una mesa para dos.`). */
  prompt: NonEmptyString,
  /** Answer patterns (`{a|b}`, `[x]`); the first sentence of the first entry is the model reply. */
  accepted: z.array(NonEmptyString).min(1),
  /** Spanish, shown after a reply that is not good. */
  tip: NonEmptyString.optional(),
  /** Where a correct or almost-correct reply leads. */
  next: LocalId,
  /** Where a wrong reply leads (the character did not understand); defaults to `next`. */
  wrongNext: LocalId.optional(),
});

export const DialogueEndNodeSchema = z.strictObject({
  id: LocalId,
  kind: z.literal("end"),
  /** Spanish: how the conversation ended. */
  text: NonEmptyString,
});

export const DialogueNodeSchema = z.discriminatedUnion("kind", [
  DialogueNpcNodeSchema,
  DialogueChooseNodeSchema,
  DialogueWriteNodeSchema,
  DialogueEndNodeSchema,
]);
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;
export type DialogueNpcNode = z.infer<typeof DialogueNpcNodeSchema>;
export type DialogueChooseNode = z.infer<typeof DialogueChooseNodeSchema>;
export type DialogueWriteNode = z.infer<typeof DialogueWriteNodeSchema>;
export type DialogueEndNode = z.infer<typeof DialogueEndNodeSchema>;
/** A node where the learner replies. */
export type DialogueTurnNode = DialogueChooseNode | DialogueWriteNode;

export const DialogueSchema = z.strictObject({
  /** `<level>.dialogues.<slug>`; results are kept under it like a lesson's. */
  id: IdSchema,
  level: LevelSchema,
  /** Spanish (`Facturar en el aeropuerto`). */
  title: NonEmptyString,
  /** Spanish: where the learner is and what they want. */
  setting: NonEmptyString,
  characters: z.array(DialogueCharacterSchema).min(1).max(3),
  /** The first node's id. */
  start: LocalId,
  nodes: z.array(DialogueNodeSchema).min(2),
  /** Study cards the recap links ("Lo nuevo de hoy"). */
  cardIds: z.array(IdSchema).min(1).max(3).optional(),
});
export type Dialogue = z.infer<typeof DialogueSchema>;
