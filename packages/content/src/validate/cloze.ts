import { duplicateErrors, exerciseEntries, normalize } from "./helpers";
import type { LoadedFile, Rule, ValidationError } from "./types";

export const CLOZE_BLANK = "___";

/**
 * - The sentence has exactly one underscore run and it is exactly `___`
 *   (`____` or a stray `_` would render as a second, unanswerable blank).
 * - Answers and distractors never contain `_`.
 * - No normalized duplicates among answers or among distractors.
 * - No accepted answer appears among the distractors.
 */
export const validateClozes: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  for (const { file, path, exercise } of exerciseEntries(files)) {
    if (exercise.type !== "cloze") continue;
    const runs = exercise.sentence.match(/_+/g) ?? [];
    if (runs.length !== 1 || runs[0] !== CLOZE_BLANK) {
      const found = runs.length === 0 ? "none" : runs.map((r) => `"${r}"`).join(", ");
      errors.push({
        file,
        path: `${path}.sentence`,
        message: `cloze sentence must contain exactly one blank written as "${CLOZE_BLANK}" (found ${found})`,
      });
    }
    const lists = [
      ["answers", "answer", exercise.answers],
      ["distractors", "distractor", exercise.distractors],
    ] as const;
    for (const [key, label, values] of lists) {
      values.forEach((v, i) => {
        if (v.includes("_")) {
          errors.push({
            file,
            path: `${path}.${key}[${i}]`,
            message: `${label} "${v}" must not contain "_"`,
          });
        }
      });
      errors.push(...duplicateErrors(values, "text", label, file, `${path}.${key}`));
    }
    const answers = new Set(exercise.answers.map(normalize));
    exercise.distractors.forEach((d, i) => {
      if (answers.has(normalize(d))) {
        errors.push({
          file,
          path: `${path}.distractors[${i}]`,
          message: `distractor "${d}" is also an accepted answer`,
        });
      }
    });
  }
  return errors;
};
