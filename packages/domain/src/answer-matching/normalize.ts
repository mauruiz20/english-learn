/**
 * Upper bound on canonical candidates per answer. Each ambiguous contraction
 * (`'s`, `'d`) multiplies the candidates; once the bound would be exceeded,
 * remaining ambiguous contractions keep only their first (default) reading.
 */
export const MAX_CANDIDATES = 16;

const EDGE_CHARS = String.raw`\s"'.,!?;:¡¿()\[\]\-…`;
const LEADING_EDGE = new RegExp(`^[${EDGE_CHARS}]+`, "u");
const TRAILING_EDGE = new RegExp(`[${EDGE_CHARS}]+$`, "u");

/**
 * Surface normalization: NFC, straight quotes, lowercase, collapsed whitespace,
 * no spaces before punctuation, no leading/trailing punctuation or quotes
 * (which also drops a final `.`, `!` or `?`).
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[‘’‚‛′ʼ`´]/gu, "'")
    .replace(/[“”„‟″«»]/gu, '"')
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .replace(/ ([.,!?;:])/gu, "$1")
    .replace(LEADING_EDGE, "")
    .replace(TRAILING_EDGE, "");
}

const NOT_LETTER_BEFORE = String.raw`(?<![\p{L}'])`;
const NOT_LETTER_AFTER = String.raw`(?![\p{L}])`;

const word = (source: string) =>
  new RegExp(`${NOT_LETTER_BEFORE}${source}${NOT_LETTER_AFTER}`, "gu");
const suffix = (source: string) => new RegExp(`(\\p{L}+)${source}${NOT_LETTER_AFTER}`, "gu");

/** Unambiguous expansions, applied in order (irregular forms before the generic `n't`). */
const UNAMBIGUOUS: ReadonlyArray<readonly [RegExp, string]> = [
  [word("won't"), "will not"],
  [word("can't"), "can not"],
  [word("cannot"), "can not"],
  [word("shan't"), "shall not"],
  [word("let's"), "let us"],
  [suffix("n't"), "$1 not"],
  [suffix("'m"), "$1 am"],
  [suffix("'re"), "$1 are"],
  [suffix("'ve"), "$1 have"],
  [suffix("'ll"), "$1 will"],
];

/** Ambiguous contractions; the first reading is the default kept when the bound is hit. */
const AMBIGUOUS_READINGS: Readonly<Record<string, readonly string[]>> = {
  s: ["'s", " is", " has"],
  d: [" would", " had"],
};
const AMBIGUOUS = /(?<=\p{L})'([sd])(?![\p{L}])/u;

/**
 * Normalizes the answer and expands contractions into a canonical form.
 * Returns every reading of the ambiguous contractions (bounded by MAX_CANDIDATES),
 * so both sides can be compared reading-by-reading.
 */
export function canonicalCandidates(raw: string): string[] {
  let text = normalizeAnswer(raw);
  for (const [pattern, replacement] of UNAMBIGUOUS) text = text.replace(pattern, replacement);

  // split() with a capture group yields [text, key, text, key, ..., text].
  const parts = text.split(AMBIGUOUS);
  let candidates = [parts[0] ?? ""];
  for (let i = 1; i < parts.length; i += 2) {
    const readings = AMBIGUOUS_READINGS[parts[i] ?? ""] ?? [];
    const usable =
      candidates.length * readings.length <= MAX_CANDIDATES ? readings : readings.slice(0, 1);
    const tail = parts[i + 1] ?? "";
    candidates = candidates.flatMap((prefix) => usable.map((reading) => prefix + reading + tail));
  }
  return [...new Set(candidates)];
}
