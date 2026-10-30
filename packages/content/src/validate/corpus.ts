import { validateClozes } from "./cloze";
import { validateListDuplicates } from "./duplicates";
import { validateLayout } from "./layout";
import { validateLevels } from "./levels";
import { validateAnswerIndexes, validateOptionDuplicates } from "./options";
import { validateTextPunctuation } from "./punctuation";
import { validateReferences } from "./references";
import { validateExerciseTopics, validateTopics } from "./topics";
import type { LoadedFile, Rule, ValidationError } from "./types";
import { validateUniqueIds } from "./unique-ids";
import { validateWordOrders } from "./word-order";

/** Rules that look at one file at a time and never resolve references. */
const LOCAL_RULES: readonly Rule[] = [
  validateLayout,
  validateAnswerIndexes,
  validateOptionDuplicates,
  validateClozes,
  validateWordOrders,
  validateListDuplicates,
  validateTopics,
  validateTextPunctuation,
];

/** Rules that need the whole corpus (ids, references, levels across files). */
const CROSS_FILE_RULES: readonly Rule[] = [
  validateUniqueIds,
  validateReferences,
  validateExerciseTopics,
  validateLevels,
];

/**
 * Reference-free rules only. Safe to run on a partial corpus (e.g. when some
 * files failed to parse), since nothing here depends on other files.
 */
export function validateLocal(files: readonly LoadedFile[]): ValidationError[] {
  return LOCAL_RULES.flatMap((rule) => rule(files));
}

/** Runs every semantic rule over the whole corpus. Pure; never throws. */
export function validateCorpus(files: readonly LoadedFile[]): ValidationError[] {
  return [...validateLocal(files), ...CROSS_FILE_RULES.flatMap((rule) => rule(files))];
}
