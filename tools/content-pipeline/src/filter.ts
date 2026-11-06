/**
 * Pure filters deciding whether a Tatoeba pair is a usable learning candidate.
 * They are deliberately conservative: a human still picks the final sentences.
 */
import type { Pair, Sentence } from "./tatoeba";

export const PIPELINE_LEVELS = ["A2", "B1", "B2", "C1"] as const;

export type PipelineLevel = (typeof PIPELINE_LEVELS)[number];

/** The `--level` argument as a level, or an error naming the accepted ones. */
export function parseLevel(value: string): PipelineLevel {
  const level = PIPELINE_LEVELS.find((l) => l === value);
  if (level === undefined) throw new Error("--level must be A2, B1, B2 or C1");
  return level;
}

/** Inclusive English word-count range per level. */
export const WORD_RANGE: Record<PipelineLevel, { min: number; max: number }> = {
  A2: { min: 3, max: 14 },
  B1: { min: 6, max: 20 },
  B2: { min: 8, max: 24 },
  C1: { min: 10, max: 30 },
};

/** Capitalized words that are not proper names of people or places. */
const ALLOWED_CAPITALIZED = new Set([
  "i",
  "i'm",
  "i've",
  "i'll",
  "i'd",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "english",
  "spanish",
  "mr",
  "mrs",
  "christmas",
]);

/**
 * Frequent Tatoeba first names (sentence-initial capitals cannot be told apart
 * from names by case alone, so the most common ones are listed).
 */
const COMMON_NAMES = new Set([
  "tom",
  "mary",
  "john",
  "alice",
  "bob",
  "jack",
  "ken",
  "mike",
  "jane",
  "linda",
  "dan",
  "sami",
  "layla",
  "fadil",
  "lucy",
  "emily",
  "bill",
  "james",
  "paul",
  "tony",
  "maria",
  "yanni",
  "skura",
  "ziri",
  "rima",
  "mennad",
  "baya",
]);

/**
 * Words that make a sentence unsuitable for a general-audience app. Kept short
 * and broad on purpose; matched as whole words.
 */
const BLOCKED_WORDS = new Set([
  "kill",
  "killed",
  "killing",
  "murder",
  "murdered",
  "suicide",
  "gun",
  "guns",
  "shoot",
  "shot",
  "drunk",
  "beer",
  "wine",
  "whiskey",
  "vodka",
  "drugs",
  "sex",
  "sexy",
  "naked",
  "damn",
  "hell",
  "stupid",
  "idiot",
  "hate",
  "die",
  "died",
  "dead",
  "death",
  "war",
  "god",
  "church",
  "pregnant",
  "fat",
  "ugly",
  "crap",
  "shit",
  "fuck",
  "bitch",
  "ass",
]);

/** Splits on whitespace; the unit for all length rules. */
export function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/** Lowercase word with surrounding punctuation removed (keeps inner apostrophes). */
export function bareWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "")
    .replace(/^'+|'+$/g, "");
}

export function inWordRange(text: string, level: PipelineLevel): boolean {
  const n = words(text).length;
  const { min, max } = WORD_RANGE[level];
  return n >= min && n <= max;
}

/** True when the sentence contains any digit (numbers-heavy content is skipped entirely). */
export function hasDigits(text: string): boolean {
  return /\p{N}/u.test(text);
}

/** Heuristic proper-name detector for English sentences. */
export function hasProperName(text: string): boolean {
  const ws = words(text);
  return ws.some((raw, i) => {
    const w = bareWord(raw);
    if (w.length === 0) return false;
    if (COMMON_NAMES.has(w) || COMMON_NAMES.has(w.replace(/'s$/, ""))) return true;
    const capitalized = /^[^\p{L}]*\p{Lu}/u.test(raw);
    if (i === 0 || !capitalized) return false;
    return !ALLOWED_CAPITALIZED.has(w);
  });
}

export function hasBlockedWord(text: string): boolean {
  return words(text).some((w) => BLOCKED_WORDS.has(bareWord(w)));
}

function hasAuthor(s: Sentence): boolean {
  return s.author !== null && s.author.length > 0;
}

/** Shape checks shared by both languages: no digits, no odd characters, ends like a sentence. */
function looksClean(text: string): boolean {
  return !hasDigits(text) && !/["()[\]{}<>/\\#@*_~|]/.test(text) && /[.!?]$/.test(text);
}

/**
 * Keeps the Spanish translations that are attributable and clean, and returns
 * the pair only when the English side also passes every rule for `level`.
 */
export function filterPair(pair: Pair, level: PipelineLevel): Pair | null {
  const { eng } = pair;
  if (!hasAuthor(eng)) return null;
  if (!inWordRange(eng.text, level)) return null;
  if (!looksClean(eng.text) || hasProperName(eng.text) || hasBlockedWord(eng.text)) return null;
  const spa = pair.spa.filter((s) => hasAuthor(s) && looksClean(s.text));
  return spa.length > 0 ? { eng, spa } : null;
}
