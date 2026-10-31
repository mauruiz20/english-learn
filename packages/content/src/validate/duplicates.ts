import { duplicateErrors } from "./helpers";
import type { LoadedFile, Rule, ValidationError } from "./types";

/**
 * No repeated entries inside one entity's list: ids compare exactly, text
 * compares normalized. (Cloze answers/distractors are covered by the cloze
 * rule; options by the options rule; translate_write accepted patterns by the
 * answer-pattern rule, which compares their expansions.)
 */
export const validateListDuplicates: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    (data.items ?? []).forEach((item, i) =>
      errors.push(...duplicateErrors(item.topics, "text", "topic", file, `items[${i}].topics`)),
    );
    (data.passages ?? []).forEach((p, i) =>
      errors.push(...duplicateErrors(p.topics, "text", "topic", file, `passages[${i}].topics`)),
    );
    (data.exercises ?? []).forEach((ex, i) => {
      const base = `exercises[${i}]`;
      errors.push(...duplicateErrors(ex.itemIds, "exact", "item id", file, `${base}.itemIds`));
      if (ex.type === "word_order") {
        errors.push(
          ...duplicateErrors(ex.accepted, "text", "accepted sentence", file, `${base}.accepted`),
        );
      }
    });
    (data.lessons ?? []).forEach((lesson, i) =>
      errors.push(
        ...duplicateErrors(
          lesson.exerciseIds,
          "exact",
          "exercise id",
          file,
          `lessons[${i}].exerciseIds`,
        ),
      ),
    );
  }
  return errors;
};
