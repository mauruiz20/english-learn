import { exerciseEntries, normalize } from "./helpers";
import type { LoadedFile, Rule, ValidationError } from "./types";

export const CLOZE_BLANK = "___";

/** Exactly one blank per sentence, and no accepted answer among the distractors. */
export const validateClozes: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  for (const { file, path, exercise } of exerciseEntries(files)) {
    if (exercise.type !== "cloze") continue;
    const blanks = exercise.sentence.split(CLOZE_BLANK).length - 1;
    if (blanks !== 1) {
      errors.push({
        file,
        path: `${path}.sentence`,
        message: `cloze sentence must contain exactly one "${CLOZE_BLANK}" (found ${blanks})`,
      });
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
