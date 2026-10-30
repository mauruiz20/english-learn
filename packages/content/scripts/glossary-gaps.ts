/**
 * Authoring aid (`pnpm --filter @english-learn/content glossary:gaps`).
 *
 * Lists every word in learner-visible English text that has no glossary entry,
 * most frequent first, with one example text each, so entries can be authored
 * in batches. Works even when the content has other errors (it uses every file
 * that passed the schema). `--limit N` prints only the first N words.
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { glossaryKey } from "@english-learn/domain";
import { findUncoveredWords } from "../src/validate";
import { load } from "./validate";

const DEFAULT_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

export interface GlossaryGap {
  /** Lowercase lookup key of the word. */
  readonly word: string;
  /** Number of texts that use it. */
  readonly count: number;
  readonly file: string;
  readonly path: string;
  /** The first text that uses it. */
  readonly example: string;
}

export function glossaryGaps(dir: string = DEFAULT_DATA_DIR): GlossaryGap[] {
  const gaps = new Map<string, GlossaryGap>();
  for (const found of findUncoveredWords(load(dir).loaded)) {
    const word = glossaryKey(found.word);
    const gap = gaps.get(word);
    gaps.set(
      word,
      gap
        ? { ...gap, count: gap.count + 1 }
        : { word, count: 1, file: found.file, path: found.path, example: found.text },
    );
  }
  return [...gaps.values()].sort(
    (a, b) => b.count - a.count || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0),
  );
}

export function formatGaps(gaps: readonly GlossaryGap[]): string {
  return [
    ...gaps.map((g) => `${g.word}\t${g.count}\t${g.file} ${g.path}\t${g.example}`),
    `${gaps.length} uncovered word(s)`,
  ].join("\n");
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const args = process.argv.slice(2);
  const limitAt = args.indexOf("--limit");
  const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
  const gaps = glossaryGaps();
  console.log(formatGaps(gaps.slice(0, limit)));
  if (gaps.length > limit) console.log(`(${gaps.length} in total)`);
}
