import { exerciseEntries } from "./helpers";
import type { LoadedFile, Rule, ValidationError } from "./types";

/**
 * Convention: tokens are authored exactly as they appear in the sentence, with
 * punctuation attached to its word ("rained."). Splitting an accepted sentence
 * on whitespace must yield the same multiset of tokens, i.e. the tokens
 * joined by single spaces in the right order rebuild the accepted sentence
 * exactly. At least one accepted sentence must be reachable from the tokens;
 * by convention that is the first (canonical) one.
 */
const words = (sentence: string): string[] => sentence.trim().split(/\s+/);
const key = (tokens: readonly string[]): string => [...tokens].sort().join("\u0000");

export const validateWordOrders: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  for (const { file, path, exercise } of exerciseEntries(files)) {
    if (exercise.type !== "word_order") continue;
    const tokens = exercise.tokens.map((t) => t.trim());
    const tokenKey = key(tokens);
    if (!exercise.accepted.some((a) => key(words(a)) === tokenKey)) {
      errors.push({
        file,
        path: `${path}.tokens`,
        message:
          "tokens do not rebuild any accepted sentence (compare as a multiset of whitespace-split words, punctuation attached)",
      });
    }
  }
  return errors;
};
