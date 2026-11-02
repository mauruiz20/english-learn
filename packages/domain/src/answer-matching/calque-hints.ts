import type { WordDiffOp } from "./word-diff";

/**
 * Common calques of Spanish speakers, recognized on the word diff, each with a short explanation
 * in Spanish. Only clear-cut patterns: an extra "the" before an abstract or generic noun ("the
 * music", "the people") is left out on purpose, since it is often right.
 */

/** Nouns that go without "the" in fixed phrases ("to work", "at home", "have lunch"). */
const BARE_NOUNS: ReadonlyArray<{
  readonly nouns: readonly string[];
  readonly hint: (phrase: string) => string;
}> = [
  {
    nouns: ["work", "home", "school", "bed", "church", "class", "college", "university"],
    hint: (phrase) => `En inglés se dice '${phrase}', sin 'the'.`,
  },
  {
    nouns: ["breakfast", "lunch", "dinner"],
    hint: (phrase) => `Con las comidas no se usa 'the': se dice '${phrase}'.`,
  },
];

/** Subject pronouns Spanish leaves out ("Es…", "Tengo…"). */
const SUBJECT_PRONOUNS = new Set(["i", "you", "he", "she", "it", "we", "they"]);

/** Words after which a new clause, and so a subject, starts. */
const CLAUSE_STARTERS = new Set(["and", "but", "because", "so", "that", "when", "if", "or"]);

const keyOf = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

const capitalized = (word: string) =>
  word === "i" ? "I" : word.charAt(0).toUpperCase() + word.slice(1);

/** An extra "the" right before a noun of `BARE_NOUNS` that the learner placed right. */
function extraArticle(ops: readonly WordDiffOp[]): string | undefined {
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i] as WordDiffOp;
    const next = ops[i + 1];
    if (op.kind !== "extra" || keyOf(op.text) !== "the" || next?.kind !== "same") continue;
    const noun = keyOf(next.text);
    const group = BARE_NOUNS.find((g) => g.nouns.includes(noun));
    if (group === undefined) continue;
    // The word before the noun, skipping other superfluous words ("go to the home" → "go home").
    let before: WordDiffOp | undefined;
    for (let b = i - 1; b >= 0; b--) {
      const candidate = ops[b] as WordDiffOp;
      if (candidate.kind === "extra") continue;
      before = candidate;
      break;
    }
    const prefix = before?.kind === "same" ? `${keyOf(before.text)} ` : "";
    return group.hint(`${prefix}${noun}`);
  }
  return undefined;
}

/** A subject pronoun missing at the start of a sentence or clause. */
function missingSubject(ops: readonly WordDiffOp[]): string | undefined {
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i] as WordDiffOp;
    if (op.kind !== "missing") continue;
    const [pronoun = "", ...rest] = op.expected.toLowerCase().split(" ");
    if (!SUBJECT_PRONOUNS.has(pronoun)) continue;
    const previous = ops[i - 1];
    const startsClause =
      previous === undefined ||
      (previous.kind === "same" && CLAUSE_STARTERS.has(keyOf(previous.text)));
    if (!startsClause) continue;
    const next = ops[i + 1];
    const verb =
      rest.length > 0 ? rest.join(" ") : next?.kind === "same" ? keyOf(next.text) : undefined;
    const example = verb === undefined ? capitalized(pronoun) : `${capitalized(pronoun)} ${verb}`;
    return `En inglés el sujeto es obligatorio: '${example}…'.`;
  }
  return undefined;
}

const HINTS: ReadonlyArray<(ops: readonly WordDiffOp[]) => string | undefined> = [
  extraArticle,
  missingSubject,
];

/** The first calque the word diff shows, explained in Spanish; undefined if none. */
export function calqueHint(ops: readonly WordDiffOp[]): string | undefined {
  for (const hint of HINTS) {
    const found = hint(ops);
    if (found !== undefined) return found;
  }
  return undefined;
}
