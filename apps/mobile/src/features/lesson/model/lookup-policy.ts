import { annotateText, type GlossaryIndex } from "@english-learn/domain";
import type { LookupLocks, TextRange } from "@/features/glossary/model/lookup-runs";
import type { PreparedExercise } from "./prepare-exercise";

/**
 * English text areas of the exercises where the learner may look words up. The rule: what the
 * exercise evaluates is locked until the answer is checked; everything else is free. After the
 * check (feedback), everything unlocks. Spanish text and UI copy never link. The placement test
 * has no lookups at all (it measures the level).
 */
export type LookupArea =
  /** The English prompt; its quoted target term is locked separately (`vocabLocks`). */
  | "vocab.prompt"
  /** English options of a "Choose the English for '…'" prompt (Spanish ones never link). */
  | "vocab.options"
  /** The sentence around the gap. */
  | "cloze.sentence"
  /** The answer and distractor chips: what is evaluated. */
  | "cloze.options"
  /** The sentence being translated: the whole exercise. */
  | "translation_choice.sentence"
  /** The word tokens and the built sentence. */
  | "word_order.tokens"
  /** Title and text: comprehension is evaluated by the questions, not vocabulary. */
  | "reading.passage"
  | "reading.questions"
  | "reading.options"
  /** The English answer shown with the feedback (exists only once checked). */
  | "feedback.answer"
  /** English terms under "Para repasar" on the summary. */
  | "summary.terms";

/** Areas locked until the answer is checked. */
const LOCKED_UNTIL_ANSWERED: ReadonlySet<LookupArea> = new Set([
  "vocab.options",
  "cloze.options",
  "translation_choice.sentence",
  "word_order.tokens",
  "reading.options",
]);

/** Whether words in `area` can be looked up, before (`answered: false`) or after the check. */
export function lookupEnabled(area: LookupArea, answered: boolean): boolean {
  return answered || !LOCKED_UNTIL_ANSWERED.has(area);
}

/** The first quoted part of a prompt: `'…'` opened after a space and closed before one. */
const QUOTED = /(?<=^|\s)'(.+?)'(?=[\s?.!,:;]|$)/u;
const SPANISH_TERM_PROMPT = /^Choose the English for '/u;

function quotedRange(prompt: string): TextRange | null {
  const match = QUOTED.exec(prompt);
  if (match === null || match[1] === undefined) return null;
  const start = match.index + 1;
  return [start, start + match[1].length];
}

/**
 * Locks of a vocab prompt. "What does 'X' mean (in 'Y')?": the term X is evaluated, so it is
 * locked until the answer is checked, wherever it appears (also inside the example Y).
 * "Choose the English for 'X'.": X is Spanish and never links.
 */
export function vocabLocks(
  prompt: string,
  index: GlossaryIndex,
  answered: boolean,
): Required<LookupLocks> {
  const range = quotedRange(prompt);
  if (range === null) return { lockedRanges: [], lockedEntryIds: [] };
  if (SPANISH_TERM_PROMPT.test(prompt)) return { lockedRanges: [range], lockedEntryIds: [] };
  if (answered) return { lockedRanges: [], lockedEntryIds: [] };
  const target = annotateText(prompt.slice(range[0], range[1]), index);
  const lockedEntryIds = [
    ...new Set(target.flatMap((s) => (s.entryId === null ? [] : [s.entryId]))),
  ];
  return { lockedRanges: [range], lockedEntryIds };
}

/** The vocab options are English (and may link once answered) only for "Choose the English…". */
export function vocabOptionsAreEnglish(prompt: string): boolean {
  return SPANISH_TERM_PROMPT.test(prompt);
}

/** Whether the correct answer shown with the feedback is English (and may link). */
export function answerIsEnglish(prepared: PreparedExercise): boolean {
  switch (prepared.type) {
    case "vocab":
      return vocabOptionsAreEnglish(prepared.exercise.prompt);
    case "translation_choice":
      return false;
    case "cloze":
    case "word_order":
    case "reading":
    case "translate_write":
    case "listen":
      return true;
  }
}

/** Whether the exercise body shows any word that can be looked up (for the first-time hint). */
export function hasLookups(prepared: PreparedExercise, answered: boolean): boolean {
  switch (prepared.type) {
    case "vocab":
    case "cloze":
    case "reading":
      return true;
    case "translation_choice":
    case "word_order":
    // A listening exercise shows no English before the check (the sentences are what it asks).
    case "listen":
      return answered;
    case "translate_write":
      return false;
  }
}
