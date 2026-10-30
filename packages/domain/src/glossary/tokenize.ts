import type { Token } from "./types";

const APOSTROPHE = "'’ʼ";
const WORD_CHAR = String.raw`\p{L}\p{M}\p{N}`;

/**
 * A word candidate, tried in order:
 * - dotted abbreviations (`p.m.`, `U.S.`);
 * - letters/digits joined by inner apostrophes or hyphens (`won't`, `city's`,
 *   `well-known`).
 * A trailing apostrophe is never part of a word: a plural possessive
 * (`students'`) cannot be told apart from a closing quote (`'the dishes'`), and
 * both read correctly as the bare word.
 */
const WORD = new RegExp(
  String.raw`(?:\p{L}\.){2,}|[${WORD_CHAR}]+(?:[${APOSTROPHE}-][${WORD_CHAR}]+)*`,
  "gu",
);
const DIGIT = /\p{N}/u;
const HYPHEN_PART = /[^-]+|-/gu;
const CURLY_APOSTROPHES = /[‘’‚‛′ʼ`´]/gu;

/** Lookup key for a word or form: NFC, straight apostrophes, lowercase. */
export function glossaryKey(text: string): string {
  return text.normalize("NFC").replace(CURLY_APOSTROPHES, "'").toLowerCase();
}

/**
 * Splits `text` into word tokens and the text between them, with offsets.
 * Tokens alternate between `word` and `other`, and their texts concatenate to
 * `text` exactly, so a UI can re-render it. Anything containing a digit
 * (`2019`, `3rd`, `8:30`) is `other`. A hyphenated word stays whole only when
 * `isForm(key)` says the hyphenated form is known; otherwise it is split at
 * the hyphens.
 */
export function tokenizeForGlossary(
  text: string,
  isForm: (key: string) => boolean = () => false,
): Token[] {
  const pieces: Token[] = [];
  const push = (kind: Token["kind"], start: number, end: number) => {
    if (end <= start) return;
    const last = pieces[pieces.length - 1];
    if (kind === "other" && last?.kind === "other") {
      pieces[pieces.length - 1] = {
        kind,
        text: last.text + text.slice(start, end),
        start: last.start,
        end,
      };
    } else {
      pieces.push({ kind, text: text.slice(start, end), start, end });
    }
  };
  const pushCandidate = (candidate: string, start: number) => {
    push(DIGIT.test(candidate) ? "other" : "word", start, start + candidate.length);
  };

  let cursor = 0;
  for (const match of text.matchAll(WORD)) {
    const candidate = match[0];
    const start = match.index;
    push("other", cursor, start);
    if (candidate.includes("-") && !isForm(glossaryKey(candidate))) {
      for (const part of candidate.matchAll(HYPHEN_PART)) {
        if (part[0] === "-") push("other", start + part.index, start + part.index + 1);
        else pushCandidate(part[0], start + part.index);
      }
    } else {
      pushCandidate(candidate, start);
    }
    cursor = start + candidate.length;
  }
  push("other", cursor, text.length);
  return pieces;
}
