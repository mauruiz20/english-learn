import { MAX_PATTERN_EXPANSIONS, expandPattern } from "@english-learn/domain";
import { normalize } from "./helpers";
import { DOUBLED_DOTS } from "./punctuation";
import type { LoadedFile, Rule, ValidationError } from "./types";

/**
 * `translate_write` accepted entries are answer patterns (see `expandPattern` in
 * `@english-learn/domain`):
 * - every entry parses and stands for at most MAX_PATTERN_EXPANSIONS sentences;
 * - all entries of one exercise together stand for at most MAX_PATTERN_EXPANSIONS sentences;
 * - no sentence (normalized) comes from two entries;
 * - every sentence passes the text rules (non-empty, no doubled terminal punctuation).
 */
export const validateAnswerPatterns: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    (data.exercises ?? []).forEach((exercise, i) => {
      if (exercise.type !== "translate_write") return;
      const base = `exercises[${i}].accepted`;
      const origin = new Map<string, number>();
      let total = 0;
      exercise.accepted.forEach((entry, j) => {
        const path = `${base}[${j}]`;
        const result = expandPattern(entry);
        if (!result.ok) {
          errors.push({ file, path, message: `invalid answer pattern: ${result.error}` });
          return;
        }
        total += result.expansions.length;
        for (const sentence of result.expansions) {
          if (sentence === "") {
            errors.push({ file, path, message: "a pattern expansion is empty" });
            continue;
          }
          if (DOUBLED_DOTS.test(sentence)) {
            errors.push({
              file,
              path,
              message: `expansion "${sentence}" has doubled terminal punctuation`,
            });
          }
          const key = normalize(sentence);
          const first = origin.get(key);
          if (first === undefined) origin.set(key, j);
          else if (first !== j) {
            errors.push({
              file,
              path,
              message: `duplicate accepted sentence "${sentence}" (normalized), also from accepted[${first}]`,
            });
          }
        }
      });
      if (total > MAX_PATTERN_EXPANSIONS) {
        errors.push({
          file,
          path: base,
          message: `the accepted patterns stand for ${total} sentences (more than ${MAX_PATTERN_EXPANSIONS})`,
        });
      }
    });
  }
  return errors;
};
