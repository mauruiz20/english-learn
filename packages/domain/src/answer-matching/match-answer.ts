import { levenshtein } from "./levenshtein";
import { canonicalCandidates } from "./normalize";

export type Verdict = "correct" | "almost" | "wrong";

export type MatchResult = {
  readonly verdict: Verdict;
  /** The accepted answer (original text) closest to the input; "" if none were given. */
  readonly closest: string;
};

/** Maximum character edits allowed for "almost", by canonical length of the accepted answer. */
export function typoBudget(length: number): number {
  if (length <= 10) return 1;
  if (length <= 25) return 2;
  return 3;
}

/**
 * "Almost" requires a pure in-word typo: same number of words, exactly one word
 * differs, and that word is less than half rewritten. This rejects swapping a
 * short word for another real one ("in" → "on", "a" → "an") and missing/extra words,
 * which are grammar mistakes rather than typos.
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

type BestPair = { accepted: string; input: string; target: string; distance: number };

/**
 * Compares a learner's answer against the accepted answers.
 *
 * - correct: some canonical reading of the input equals some canonical reading of an
 *   accepted answer (normalization + contraction expansion, see `canonicalCandidates`).
 * - almost: not correct, input non-empty, the closest pair is within `typoBudget`
 *   and the difference is a typo inside a single word (`isSingleWordTypo`).
 * - wrong: everything else.
 */
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

export function matchAnswer(input: string, accepted: readonly string[]): MatchResult {
  const inputCandidates = canonicalCandidates(input);
  let best: BestPair | null = null;

  for (const { answer, canonical } of targetsOf(accepted)) {
    for (const target of canonical) {
      for (const candidate of inputCandidates) {
        const distance = levenshtein(candidate, target);
        if (best === null || distance < best.distance) {
          best = { accepted: answer, input: candidate, target, distance };
          if (distance === 0) return finish(best);
        }
      }
    }
  }

  return best === null ? { verdict: "wrong", closest: "" } : finish(best);
}

function finish(best: BestPair): MatchResult {
  const closest = best.accepted;
  if (best.input === "") return { verdict: "wrong", closest };
  if (best.distance === 0) return { verdict: "correct", closest };

  const almost =
    best.distance <= typoBudget(best.target.length) && isSingleWordTypo(best.input, best.target);
  return { verdict: almost ? "almost" : "wrong", closest };
}
