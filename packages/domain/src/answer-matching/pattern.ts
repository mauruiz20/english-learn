import { matchAnswer, type MatchResult } from "./match-answer";

/**
 * Answer patterns: one `accepted` entry that stands for many sentences.
 *
 * - `{a|b|c}`: exactly one of the alternatives (an alternative may be empty: `{very |}`).
 * - `[x]`: optional, `[a|b]`: nothing or one of the alternatives. The reading without the
 *   optional part comes first.
 * - Groups nest freely: `I [{usually|often} ]get up {early|at six[ o'clock]}.`
 * - `\` escapes the next character (`\{ \} \[ \] \| \\`); everything else is literal text.
 * - Whitespace of every expansion is normalized: runs collapse to one space, the ends are
 *   trimmed and spaces before `.,!?;:` are removed, so `I like it [very much] .` works.
 *
 * Expansions keep the order of the alternatives, without duplicates.
 */
type Sequence = readonly PatternNode[];
type PatternNode =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "choice"; readonly options: readonly Sequence[] };

export type PatternExpansion =
  | { readonly ok: true; readonly expansions: readonly string[] }
  | { readonly ok: false; readonly error: string };

/** Upper bound on the sentences one exercise's `accepted` patterns may stand for. */
export const MAX_PATTERN_EXPANSIONS = 2000;

const SPECIAL = new Set(["{", "}", "[", "]", "|", "\\"]);
const CLOSER: Readonly<Record<string, string>> = { "{": "}", "[": "]" };

class PatternError extends Error {}

function parse(pattern: string): Sequence {
  let index = 0;

  /** Alternatives up to `closer` (consumed); `closer` null = the whole pattern. */
  const parseAlternatives = (closer: string | null): Sequence[] => {
    const options: PatternNode[][] = [[]];
    let text = "";
    const current = () => options[options.length - 1] as PatternNode[];
    const flush = () => {
      if (text !== "") current().push({ kind: "text", text });
      text = "";
    };

    while (index < pattern.length) {
      const char = pattern[index] as string;
      index += 1;
      if (char === "\\") {
        if (index >= pattern.length) throw new PatternError('dangling escape "\\" at the end');
        text += pattern[index];
        index += 1;
      } else if (char === "{" || char === "[") {
        flush();
        const start = index - 1;
        const inner = parseAlternatives(CLOSER[char] as string);
        if (inner.every((option) => option.length === 0) && inner.length === 1) {
          throw new PatternError(`empty group "${char}${CLOSER[char]}" at ${start}`);
        }
        current().push({ kind: "choice", options: char === "[" ? [[], ...inner] : inner });
      } else if (char === "}" || char === "]") {
        if (char !== closer) throw new PatternError(`unexpected "${char}" at ${index - 1}`);
        flush();
        return options;
      } else if (char === "|") {
        if (closer === null) {
          throw new PatternError(`"|" outside {…} or […] at ${index - 1}`);
        }
        flush();
        options.push([]);
      } else {
        text += char;
      }
    }
    if (closer !== null) throw new PatternError(`unclosed group: missing "${closer}"`);
    flush();
    return options;
  };

  return parseAlternatives(null)[0] ?? [];
}

/** Number of raw expansions, saturating at `cap` (so huge patterns never overflow). */
function count(sequence: Sequence, cap: number): number {
  let total = 1;
  for (const node of sequence) {
    if (node.kind === "text") continue;
    let sum = 0;
    for (const option of node.options) sum = Math.min(cap, sum + count(option, cap));
    total = Math.min(cap, total * sum);
  }
  return total;
}

function expandSequence(sequence: Sequence): string[] {
  let results = [""];
  for (const node of sequence) {
    if (node.kind === "text") {
      results = results.map((prefix) => prefix + node.text);
    } else {
      const tails = node.options.flatMap(expandSequence);
      results = results.flatMap((prefix) => tails.map((tail) => prefix + tail));
    }
  }
  return results;
}

const normalizeSpaces = (text: string) =>
  text
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/ ([.,!?;:])/gu, "$1");

/** Every sentence `pattern` stands for, or why it is not a valid pattern / too large. */
export function expandPattern(
  pattern: string,
  limit: number = MAX_PATTERN_EXPANSIONS,
): PatternExpansion {
  let sequence: Sequence;
  try {
    sequence = parse(pattern);
  } catch (error) {
    if (error instanceof PatternError) return { ok: false, error: error.message };
    throw error;
  }
  if (count(sequence, limit + 1) > limit) {
    return { ok: false, error: `the pattern stands for more than ${limit} sentences` };
  }
  return { ok: true, expansions: [...new Set(expandSequence(sequence).map(normalizeSpaces))] };
}

/** True when `text` uses pattern syntax (an unescaped `{ } [ ] |`). */
export function isPattern(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    if (char === "\\") i += 1;
    else if (SPECIAL.has(char)) return true;
  }
  return false;
}

const expandedCache = new WeakMap<readonly string[], readonly string[]>();

/**
 * Every sentence an exercise's `accepted` list stands for, in order and without duplicates.
 * Memoized per array (the corpus arrays are stable), so an exercise expands once. An entry that
 * is not a valid pattern (the content validator forbids them) counts as literal text.
 */
export function expandAccepted(accepted: readonly string[]): readonly string[] {
  const cached = expandedCache.get(accepted);
  if (cached !== undefined) return cached;
  const expansions = accepted.flatMap((entry) => {
    const result = expandPattern(entry, Number.MAX_SAFE_INTEGER);
    return result.ok ? result.expansions : [entry];
  });
  const unique = [...new Set(expansions)];
  expandedCache.set(accepted, unique);
  return unique;
}

/** `matchAnswer` against every sentence the `accepted` patterns stand for. */
export function matchPatternAnswer(input: string, accepted: readonly string[]): MatchResult {
  return matchAnswer(input, expandAccepted(accepted));
}
