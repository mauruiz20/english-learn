import { canonicalCandidates, MAX_CANDIDATES } from "./normalize";

/**
 * One step of the word-level comparison between a learner's answer and an expected sentence.
 * `text` is the learner's word exactly as typed (with its punctuation); `expected` is the word
 * of the expected sentence, without surrounding punctuation.
 *
 * - same: the learner's word is right (case, punctuation and contractions do not count).
 * - extra: the learner's word should not be there.
 * - missing: the expected word(s) the learner left out, at this position.
 * - changed: the learner's word should be `expected` instead.
 */
export type WordDiffOp =
  | { readonly kind: "same"; readonly text: string }
  | { readonly kind: "extra"; readonly text: string }
  | { readonly kind: "missing"; readonly expected: string }
  | { readonly kind: "changed"; readonly text: string; readonly expected: string };

/** A word typed as one whitespace-separated token, with each canonical reading as word keys. */
type Token = { readonly text: string; readonly readings: readonly (readonly string[])[] };

/** A canonical word and the token it comes from. */
type Word = { readonly key: string; readonly token: number };

type Step =
  | { readonly kind: "same" | "changed"; readonly given: Word; readonly expected: Word }
  | { readonly kind: "extra"; readonly given: Word }
  | { readonly kind: "missing"; readonly expected: Word };

const EDGES = /^[\s"'.,!?;:¡¿()[\]\-…]+|[\s"'.,!?;:¡¿()[\]\-…]+$/gu;

/** A canonical word without punctuation: what two words are compared by. */
const keyOf = (word: string) => word.replace(/[^\p{L}\p{N}']/gu, "");

function tokenize(raw: string): Token[] {
  return raw
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((text) => ({
      text,
      readings: canonicalCandidates(text).map((reading) =>
        reading.split(" ").map(keyOf).filter(Boolean),
      ),
    }));
}

/**
 * Every combination of token readings (one per token), as flat word lists. Bounded like
 * `canonicalCandidates`: once the bound would be exceeded, tokens keep their first reading.
 */
function readingsOf(tokens: readonly Token[]): Word[][] {
  let combos: Word[][] = [[]];
  tokens.forEach((token, index) => {
    const usable =
      combos.length * token.readings.length <= MAX_CANDIDATES
        ? token.readings
        : token.readings.slice(0, 1);
    combos = combos.flatMap((prefix) =>
      usable.map((reading) => [...prefix, ...reading.map((key) => ({ key, token: index }))]),
    );
  });
  return combos;
}

/**
 * Minimum word-edit alignment (substitution, insertion and deletion all cost 1). Among equally
 * cheap alignments it prefers same, then changed, then extra, then missing, so a swap of two
 * words reads as two changes.
 */
function align(given: readonly Word[], expected: readonly Word[]): { cost: number; steps: Step[] } {
  const n = given.length;
  const m = expected.length;
  // cost[i][j]: edits to turn given[i..] into expected[j..].
  const cost = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n; i >= 0; i--) {
    for (let j = m; j >= 0; j--) {
      const row = cost[i] as number[];
      if (i === n) row[j] = m - j;
      else if (j === m) row[j] = n - i;
      else {
        const sameOrChanged =
          (cost[i + 1] as number[])[j + 1]! + (given[i]!.key === expected[j]!.key ? 0 : 1);
        row[j] = Math.min(sameOrChanged, (cost[i + 1] as number[])[j]! + 1, row[j + 1]! + 1);
      }
    }
  }

  const steps: Step[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const here = (cost[i] as number[])[j]!;
    const g = given[i];
    const e = expected[j];
    if (g !== undefined && e !== undefined) {
      const diagonal = (cost[i + 1] as number[])[j + 1]!;
      if (g.key === e.key && here === diagonal) {
        steps.push({ kind: "same", given: g, expected: e });
        i++;
        j++;
        continue;
      }
      if (g.key !== e.key && here === diagonal + 1) {
        steps.push({ kind: "changed", given: g, expected: e });
        i++;
        j++;
        continue;
      }
    }
    if (g !== undefined && (e === undefined || here === (cost[i + 1] as number[])[j]! + 1)) {
      steps.push({ kind: "extra", given: g });
      i++;
    } else {
      steps.push({ kind: "missing", expected: e as Word });
      j++;
    }
  }
  return { cost: (cost[0] as number[])[0]!, steps };
}

/** How the expected words of `steps` read, from the expected tokens' original text. */
function expectedText(words: readonly Word[], tokens: readonly Token[], chosen: Word[]): string {
  const parts: string[] = [];
  for (let k = 0; k < words.length; k++) {
    const word = words[k] as Word;
    const ofToken = chosen.filter((w) => w.token === word.token);
    const covered = words.slice(k, k + ofToken.length);
    if (
      ofToken.length > 0 &&
      covered.length === ofToken.length &&
      covered.every((w, c) => w === ofToken[c])
    ) {
      // The whole token: shown as written ("don't", "Madrid").
      parts.push((tokens[word.token]?.text ?? word.key).replace(EDGES, ""));
      k += ofToken.length - 1;
    } else {
      parts.push(word.key);
    }
  }
  return parts.join(" ");
}

/**
 * Word-level comparison of a learner's answer with an expected sentence, after the matcher's
 * normalization (case, quotes, punctuation) and contraction expansion: "don't" and "do not" are
 * the same words, and the reading of an ambiguous contraction ("'s", "'d") that fits best is used.
 *
 * Every token of the answer appears once, in order, with its original text: a token whose words
 * all match is `same`, one whose words are all superfluous is `extra`, any other mismatch is
 * `changed`. Consecutive missing words make one `missing` step. Punctuation-only tokens ("-")
 * count as `same`, so punctuation never makes a difference.
 */
export function diffAnswer(input: string, expected: string): WordDiffOp[] {
  const givenTokens = tokenize(input);
  const expectedTokens = tokenize(expected);

  let best: { cost: number; steps: Step[]; expected: Word[] } | null = null;
  for (const given of readingsOf(givenTokens)) {
    for (const wanted of readingsOf(expectedTokens)) {
      const alignment = align(given, wanted);
      if (best === null || alignment.cost < best.cost) best = { ...alignment, expected: wanted };
    }
  }
  const { steps, expected: chosen } = best ?? { steps: [], expected: [] };
  const describe = (words: readonly Word[]) => expectedText(words, expectedTokens, chosen);

  const ops: WordDiffOp[] = [];
  let nextToken = 0;
  /** Punctuation-only tokens before `token` (they have no words to align). */
  const flushUntil = (token: number) => {
    for (; nextToken < token; nextToken++) {
      ops.push({ kind: "same", text: givenTokens[nextToken]?.text ?? "" });
    }
  };

  for (let k = 0; k < steps.length;) {
    const step = steps[k] as Step;
    if (step.kind === "missing") {
      const words: Word[] = [];
      while (k < steps.length && steps[k]?.kind === "missing") {
        words.push((steps[k] as Extract<Step, { kind: "missing" }>).expected);
        k++;
      }
      ops.push({ kind: "missing", expected: describe(words) });
      continue;
    }
    // Every step up to the last word of this learner token (missing words inside it included).
    const token = step.given.token;
    let end = k;
    for (let s = k; s < steps.length; s++) {
      const candidate = steps[s] as Step;
      if (candidate.kind !== "missing" && candidate.given.token === token) end = s;
    }
    const group = steps.slice(k, end + 1);
    k = end + 1;
    flushUntil(token);
    nextToken = token + 1;
    const text = givenTokens[token]?.text ?? "";
    if (group.every((s) => s.kind === "same")) ops.push({ kind: "same", text });
    else if (group.every((s) => s.kind === "extra")) ops.push({ kind: "extra", text });
    else {
      const words = group.flatMap((s) => (s.kind === "extra" ? [] : [s.expected]));
      ops.push({ kind: "changed", text, expected: describe(words) });
    }
  }
  flushUntil(givenTokens.length);
  return ops;
}
