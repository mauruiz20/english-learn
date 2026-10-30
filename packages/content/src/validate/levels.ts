import type { Level } from "../schema";
import type { LoadedFile, Rule, ValidationError } from "./types";

/**
 * Levels across references (directory/id levels are checked by validateLayout):
 * - An exercise has the same level as each lesson that contains it.
 */
export const validateLevels: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  const exerciseLevel = new Map<string, Level>();
  for (const { data } of files)
    for (const e of data.exercises ?? []) exerciseLevel.set(e.id, e.level);

  for (const { file, data } of files) {
    (data.lessons ?? []).forEach((lesson, i) => {
      lesson.exerciseIds.forEach((id, j) => {
        const level = exerciseLevel.get(id);
        if (level !== undefined && level !== lesson.level) {
          errors.push({
            file,
            path: `lessons[${i}].exerciseIds[${j}]`,
            message: `exercise "${id}" is ${level} but the lesson is ${lesson.level}`,
          });
        }
      });
    });
  }
  return errors;
};
