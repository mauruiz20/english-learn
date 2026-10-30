import { validateClozes } from "./cloze";
import { validateListDuplicates } from "./duplicates";
import { validateLayout } from "./layout";
import { validateLevels } from "./levels";
import { validateAnswerIndexes, validateOptionDuplicates } from "./options";
import { validateReferences } from "./references";
import { validateExerciseTopics, validateTopics } from "./topics";
import type { LoadedFile, ValidationError } from "./types";
import { validateUniqueIds } from "./unique-ids";
import { validateWordOrders } from "./word-order";

const RULES = [
  validateUniqueIds,
  validateReferences,
  validateAnswerIndexes,
  validateOptionDuplicates,
  validateClozes,
  validateWordOrders,
  validateListDuplicates,
  validateLayout,
  validateTopics,
  validateExerciseTopics,
  validateLevels,
];

/** Runs every semantic rule over the whole corpus. Pure; never throws. */
export function validateCorpus(files: readonly LoadedFile[]): ValidationError[] {
  return RULES.flatMap((rule) => rule(files));
}
