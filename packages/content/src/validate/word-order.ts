import { exerciseEntries } from "./helpers";
import type { LoadedFile, Rule, ValidationError } from "./types";

/**
 * Convention: tokens are authored exactly as they appear in the sentence, with
 * punctuation attached to its word ("rained."). Splitting ANY accepted
 * sentence on whitespace must yield the same multiset of tokens, i.e. the
 * tokens joined by single spaces in the right order rebuild every accepted
 * sentence exactly; otherwise the learner could be graded against a sentence
 * they cannot build.
 *
 * Tokens must also be scrambled: if they already read as an accepted sentence
 * the puzzle is pre-solved. (The app shuffles tokens at render time anyway;
 * this keeps the data honest.)
 */
const words = (sentence: string): string[] => sentence.trim().split(/\s+/);
const key = (tokens: readonly string[]): string => [...tokens].sort().join("\u0000");

export const validateWordOrders: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  for (const { file, path, exercise } of exerciseEntries(files)) {
    if (exercise.type !== "word_order") continue;
    const tokens = exercise.tokens.map((t) => t.trim());
    const tokenKey = key(tokens);
    const inOrder = tokens.join(" ");
    exercise.accepted.forEach((a, i) => {
      if (key(words(a)) !== tokenKey) {
        errors.push({
          file,
          path: `${path}.accepted[${i}]`,
          message:
            "accepted sentence cannot be built from the tokens (compare as a multiset of whitespace-split words, punctuation attached)",
        });
      }
    });
    if (exercise.accepted.some((a) => words(a).join(" ") === inOrder)) {
      errors.push({
        file,
        path: `${path}.tokens`,
        message: "tokens are already in the order of an accepted sentence; scramble them",
      });
    }
  }
  return errors;
};
