/**
 * Pure parsing and pairing of the Tatoeba weekly exports.
 *
 * - `*_sentences_detailed.tsv`: id \t lang \t text \t username \t date added \t date modified
 * - `eng-spa_links.tsv`: sentence id \t translation id (both directions are listed)
 *
 * MySQL dumps write NULL as `\N`; an empty or `\N` username means the sentence
 * has no known author, so it cannot be attributed and is dropped later.
 */

export interface Sentence {
  id: number;
  lang: string;
  text: string;
  /** Tatoeba username of the sentence owner, or null when unknown. */
  author: string | null;
}

export interface Pair {
  eng: Sentence;
  /** Every Spanish sentence linked to `eng` (deduplicated, in link order). */
  spa: Sentence[];
}

const NULL_FIELD = "\\N";

function parseId(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

/** Parses one line of a `*_sentences_detailed.tsv` export; returns null for malformed rows. */
export function parseSentenceRow(line: string): Sentence | null {
  const fields = line.replace(/\r$/, "").split("\t");
  if (fields.length < 3) return null;
  const [rawId, lang, text, username] = fields;
  const id = parseId(rawId);
  if (id === null || !lang || lang === NULL_FIELD) return null;
  const trimmed = (text ?? "").trim();
  if (trimmed.length === 0) return null;
  const author = username && username !== NULL_FIELD ? username.trim() || null : null;
  return { id, lang, text: trimmed, author };
}

/** Parses one line of a links export; returns null for malformed rows. */
export function parseLinkRow(line: string): [number, number] | null {
  const [a, b] = line.replace(/\r$/, "").split("\t");
  const from = parseId(a);
  const to = parseId(b);
  return from === null || to === null ? null : [from, to];
}

/** Parses a whole TSV text with `parse`, skipping blank and malformed lines. */
export function parseTsv<T>(text: string, parse: (line: string) => T | null): T[] {
  const out: T[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const row = parse(line);
    if (row !== null) out.push(row);
  }
  return out;
}

/**
 * Joins English and Spanish sentences through the links. Links are listed in
 * both directions, so either orientation is accepted. Output is ordered by
 * English sentence id for stable diffs.
 */
export function buildPairs(
  eng: Iterable<Sentence>,
  spa: Iterable<Sentence>,
  links: Iterable<[number, number]>,
): Pair[] {
  const engById = new Map<number, Sentence>();
  for (const s of eng) if (s.lang === "eng") engById.set(s.id, s);
  const spaById = new Map<number, Sentence>();
  for (const s of spa) if (s.lang === "spa") spaById.set(s.id, s);

  const pairs = new Map<number, Pair>();
  for (const [a, b] of links) {
    const [e, s] = engById.has(a)
      ? [engById.get(a), spaById.get(b)]
      : [engById.get(b), spaById.get(a)];
    if (!e || !s) continue;
    const pair = pairs.get(e.id) ?? { eng: e, spa: [] };
    if (!pair.spa.some((x) => x.id === s.id)) pair.spa.push(s);
    pairs.set(e.id, pair);
  }
  return [...pairs.values()].sort((x, y) => x.eng.id - y.eng.id);
}
