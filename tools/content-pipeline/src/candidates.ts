/**
 * Builds the per-topic shortlist an author picks sentences from. Pure: the CLI
 * feeds it parsed pairs and writes the result to `.cache/`.
 */
import { bareWord, filterPair, words, type PipelineLevel } from "./filter";
import type { Pair } from "./tatoeba";

export interface Candidate {
  /** English sentence id: the id recorded in `source.sentenceId`. */
  sentenceId: number;
  author: string;
  license: "CC BY 2.0 FR";
  text: string;
  wordCount: number;
  matched: string[];
  es: { sentenceId: number; author: string; text: string }[];
}

export type Shortlist = Record<string, Candidate[]>;

/**
 * Keywords that matched `text`. A keyword is one or more words; it matches
 * when its words appear consecutively (case- and punctuation-insensitive).
 */
export function matchKeywords(text: string, keywords: readonly string[]): string[] {
  const ws = words(text).map(bareWord);
  return keywords.filter((kw) => {
    const k = words(kw).map(bareWord);
    if (k.length === 0) return false;
    for (let i = 0; i + k.length <= ws.length; i++) {
      if (k.every((w, j) => ws[i + j] === w)) return true;
    }
    return false;
  });
}

function toCandidate(pair: Pair, matched: string[]): Candidate {
  return {
    sentenceId: pair.eng.id,
    author: pair.eng.author ?? "",
    license: "CC BY 2.0 FR",
    text: pair.eng.text,
    wordCount: words(pair.eng.text).length,
    matched,
    es: pair.spa.map((s) => ({ sentenceId: s.id, author: s.author ?? "", text: s.text })),
  };
}

/**
 * For each topic, the filtered pairs matching at least one keyword, ranked by
 * number of matched keywords (desc), then shorter sentences, then id; capped at `limit`.
 */
export function buildShortlist(
  pairs: Iterable<Pair>,
  topics: Readonly<Record<string, readonly string[]>>,
  level: PipelineLevel,
  limit: number,
): Shortlist {
  const usable: Pair[] = [];
  for (const p of pairs) {
    const kept = filterPair(p, level);
    if (kept) usable.push(kept);
  }
  const out: Shortlist = {};
  for (const [topic, keywords] of Object.entries(topics)) {
    out[topic] = usable
      .map((p) => ({ p, matched: matchKeywords(p.eng.text, keywords) }))
      .filter((x) => x.matched.length > 0)
      .map((x) => toCandidate(x.p, x.matched))
      .sort(
        (a, b) =>
          b.matched.length - a.matched.length ||
          a.wordCount - b.wordCount ||
          a.sentenceId - b.sentenceId,
      )
      .slice(0, limit);
  }
  return out;
}
