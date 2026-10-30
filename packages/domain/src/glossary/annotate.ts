import { glossaryKey, tokenizeForGlossary } from "./tokenize";
import type { GlossaryEntry, GlossaryIndex, PhraseForm, Segment, Token } from "./types";

/**
 * Indexes entries for lookup. Forms are expected to be unique across entries
 * (the content validator enforces it); if two entries share a form, the first
 * one wins.
 */
export function buildGlossaryIndex(entries: readonly GlossaryEntry[]): GlossaryIndex {
  const entriesById = new Map<string, GlossaryEntry>();
  const words = new Map<string, string>();
  const phrases = new Map<string, PhraseForm[]>();
  const hyphenated = new Set<string>();
  const seenPhrases = new Set<string>();

  for (const entry of entries) {
    if (!entriesById.has(entry.id)) entriesById.set(entry.id, entry);
    for (const form of entry.forms) {
      const key = glossaryKey(form);
      const parts = key.split(/\s+/u).filter((w) => w.length > 0);
      for (const part of parts) if (part.includes("-")) hyphenated.add(part);
      const [first] = parts;
      if (first === undefined) continue;
      if (parts.length === 1) {
        if (!words.has(key)) words.set(key, entry.id);
      } else {
        const joined = parts.join(" ");
        if (seenPhrases.has(joined)) continue;
        seenPhrases.add(joined);
        const list = phrases.get(first) ?? [];
        list.push({ words: parts, entryId: entry.id });
        phrases.set(first, list);
      }
    }
  }
  for (const list of phrases.values()) {
    list.sort(
      (a, b) => b.words.length - a.words.length || (a.words.join(" ") < b.words.join(" ") ? -1 : 1),
    );
  }
  return { entriesById, words, phrases, hyphenated };
}

/**
 * Entry id for a single word (case-insensitive, curly apostrophes allowed).
 * A possessive that is not itself a listed form falls back to its base form:
 * `city's` -> `city`, `students'` -> `students`.
 */
export function lookupWord(index: GlossaryIndex, word: string): string | null {
  const key = glossaryKey(word);
  const direct = index.words.get(key);
  if (direct !== undefined) return direct;
  if (key.endsWith("'s")) return index.words.get(key.slice(0, -2)) ?? null;
  if (key.endsWith("s'")) return index.words.get(key.slice(0, -1)) ?? null;
  return null;
}

const WHITESPACE_ONLY = /^\s+$/u;

/** Number of tokens a phrase covers when it starts at `tokens[i]`, or 0 if it does not match. */
function phraseLength(tokens: readonly Token[], i: number, phrase: PhraseForm): number {
  for (let w = 1; w < phrase.words.length; w++) {
    const gap = tokens[i + 2 * w - 1];
    const word = tokens[i + 2 * w];
    if (gap?.kind !== "other" || !WHITESPACE_ONLY.test(gap.text)) return 0;
    if (word?.kind !== "word" || glossaryKey(word.text) !== phrase.words[w]) return 0;
  }
  return 2 * phrase.words.length - 1;
}

/**
 * Splits `text` into segments linked to glossary entries. Phrases are matched
 * first (longest form wins; words must be separated by whitespace only), then
 * single words via `lookupWord`. Segments cover `text` exactly, in order.
 */
export function annotateText(text: string, index: GlossaryIndex): Segment[] {
  const tokens = tokenizeForGlossary(text, (key) => index.hyphenated.has(key));
  const segments: Segment[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i] as Token;
    if (token.kind === "other") {
      segments.push({ ...token, entryId: null, kind: "other" });
      i++;
      continue;
    }
    let matched = false;
    for (const phrase of index.phrases.get(glossaryKey(token.text)) ?? []) {
      const length = phraseLength(tokens, i, phrase);
      if (length === 0) continue;
      const last = tokens[i + length - 1] as Token;
      segments.push({
        text: text.slice(token.start, last.end),
        start: token.start,
        end: last.end,
        entryId: phrase.entryId,
        kind: "phrase",
      });
      i += length;
      matched = true;
      break;
    }
    if (matched) continue;
    segments.push({ ...token, entryId: lookupWord(index, token.text), kind: "word" });
    i++;
  }
  return segments;
}
