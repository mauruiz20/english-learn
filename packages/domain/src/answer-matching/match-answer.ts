import { calqueHint } from "./calque-hints";
import { levenshtein } from "./levenshtein";
import { canonicalCandidates } from "./normalize";
import { diffAnswer, type WordDiffOp } from "./word-diff";

export type Verdict = "correct" | "almost" | "wrong";

export type MatchResult = {
  readonly verdict: Verdict;
  /** The accepted answer (original text) closest to the input; "" if none were given. */
  readonly closest: string;
  /** Word-level comparison of the input with `closest` (see `diffAnswer`). */
  readonly diff: readonly WordDiffOp[];
  /** A common Spanish-speaker calque the diff shows, explained in Spanish (see `calqueHint`). */
  readonly hint?: string;
};

/** Maximum character edits allowed for "almost", by canonical length of the accepted answer. */
export function typoBudget(length: number): number {
  if (length <= 10) return 1;
  if (length <= 25) return 2;
  return 3;
}

/**
 * Short grammar words whose omission or addition alone keeps an answer "almost": the meaning
 * survives ("to the work", "I listen music"). Negations (not, no, never, n't, nothing, nobody,
 * none, neither, nor) and content words are deliberately absent: they change the meaning.
 */
export const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  // articles
  "a",
  "an",
  "the",
  // prepositions
  "to",
  "at",
  "in",
  "on",
  "of",
  "for",
  "with",
  "from",
  "by",
  "about",
  // auxiliaries
  "do",
  "does",
  "did",
  "is",
  "are",
  "am",
  "was",
  "were",
  "have",
  "has",
  "had",
  "will",
  "would",
  // possessives
  "my",
  "your",
  "his",
  "her",
  "its",
  "our",
  "their",
  // pronoun, conjunctions
  "it",
  "and",
  "that",
]);

/** Character distance beyond which two readings cannot be one function word apart. */
const MAX_GAP_DISTANCE = Math.max(...[...FUNCTION_WORDS].map((w) => w.length)) + 3;

/**
 * "Almost" requires a pure in-word typo: same number of words, exactly one word
 * differs, and that word is less than half rewritten. This rejects swapping a
 * short word for another real one ("in" → "on", "a" → "an").
 */
function isSingleWordTypo(input: string, target: string): boolean {
  const inputWords = input.split(" ");
  const targetWords = target.split(" ");
  if (inputWords.length !== targetWords.length) return false;

  const differing = targetWords.flatMap((targetWord, i) => {
    const inputWord = inputWords[i] ?? "";
    return inputWord === targetWord ? [] : [[inputWord, targetWord] as const];
  });
  if (differing.length !== 1) return false;

  const [inputWord, targetWord] = differing[0] ?? ["", ""];
  return levenshtein(inputWord, targetWord) * 2 < targetWord.length;
}

const wordsOf = (canonical: string) =>
  canonical
    .split(" ")
    .map((word) => word.replace(/[^\p{L}\p{N}']/gu, ""))
    .filter(Boolean);

/**
 * The two readings differ by exactly one extra or missing word from `FUNCTION_WORDS`, everything
 * else equal (punctuation aside). The shorter one must keep at least two words, so a bare
 * one-word answer ("apple" for "an apple") is not let through.
 */
function isSingleFunctionWordGap(input: string, target: string): boolean {
  const a = wordsOf(input);
  const b = wordsOf(target);
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  if (longer.length !== shorter.length + 1 || shorter.length < 2) return false;
  let i = 0;
  while (i < shorter.length && longer[i] === shorter[i]) i++;
  if (!FUNCTION_WORDS.has(longer[i] ?? "")) return false;
  return shorter.slice(i).every((word, k) => word === longer[i + 1 + k]);
}

type Pair = { accepted: string; input: string; target: string; distance: number };

type Target = { readonly answer: string; readonly canonical: readonly string[] };

const targetCache = new WeakMap<readonly string[], readonly Target[]>();

/** Canonical readings of every accepted answer, computed once per accepted array. */
function targetsOf(accepted: readonly string[]): readonly Target[] {
  const cached = targetCache.get(accepted);
  if (cached !== undefined) return cached;
  const targets = accepted.map((answer) => ({ answer, canonical: canonicalCandidates(answer) }));
  targetCache.set(accepted, targets);
  return targets;
}

/**
 * Compares a learner's answer against the accepted answers.
 *
 * - correct: some canonical reading of the input equals some canonical reading of an
 *   accepted answer (normalization + contraction expansion, see `canonicalCandidates`).
 * - almost: not correct, input non-empty, and either the closest pair is within `typoBudget`
 *   and the difference is a typo inside a single word (`isSingleWordTypo`), or some pair differs
 *   only by one extra or missing function word (`isSingleFunctionWordGap`).
 * - wrong: everything else.
 *
 * The result carries the word diff against `closest` and, when it shows one, a calque hint.
 */
export function matchAnswer(input: string, accepted: readonly string[]): MatchResult {
  const inputCandidates = canonicalCandidates(input);
  let best: Pair | null = null;
  let gap: Pair | null = null;

  for (const { answer, canonical } of targetsOf(accepted)) {
    for (const target of canonical) {
      for (const candidate of inputCandidates) {
        const distance = levenshtein(candidate, target);
        const pair = { accepted: answer, input: candidate, target, distance };
        if (best === null || distance < best.distance) {
          best = pair;
          if (distance === 0) return result(input, "correct", answer);
        }
        if (
          distance <= MAX_GAP_DISTANCE &&
          (gap === null || distance < gap.distance) &&
          isSingleFunctionWordGap(candidate, target)
        ) {
          gap = pair;
        }
      }
    }
  }

  if (best === null) return result(input, "wrong", "");
  if (best.input === "") return result(input, "wrong", best.accepted);
  if (
    best.distance <= typoBudget(best.target.length) &&
    isSingleWordTypo(best.input, best.target)
  ) {
    return result(input, "almost", best.accepted);
  }
  if (gap !== null) return result(input, "almost", gap.accepted);
  return result(input, "wrong", best.accepted);
}

function result(input: string, verdict: Verdict, closest: string): MatchResult {
  const diff = diffAnswer(input, closest);
  const hint = verdict === "correct" ? undefined : calqueHint(diff);
  return hint === undefined ? { verdict, closest, diff } : { verdict, closest, diff, hint };
}
