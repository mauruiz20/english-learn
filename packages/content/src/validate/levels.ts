import { LEVELS, type Level } from "../schema";
import type { LoadedFile, Rule, ValidationError } from "./types";

const rank = (l: Level): number => LEVELS.indexOf(l);

/**
 * Levels across references (directory/id levels are checked by validateLayout).
 * Unknown ids are left to validateReferences.
 * - An exercise has the same level as each lesson that contains it.
 * - A reading exercise has the same level as its passage.
 * - Every item an exercise references is at or below the exercise level
 *   (A1 < A2 < B1 < B2 < C1).
 */
export const validateLevels: Rule = (files: readonly LoadedFile[]) => {
  const levelsOf = (kind: "items" | "exercises" | "passages") =>
    new Map<string, Level>(
      files.flatMap((f) => (f.data[kind] ?? []).map((e) => [e.id, e.level] as const)),
    );
  const itemLevel = levelsOf("items");
  const exerciseLevel = levelsOf("exercises");
  const passageLevel = levelsOf("passages");

  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    (data.exercises ?? []).forEach((ex, i) => {
      ex.itemIds.forEach((id, j) => {
        const level = itemLevel.get(id);
        if (level !== undefined && rank(level) > rank(ex.level)) {
          errors.push({
            file,
            path: `exercises[${i}].itemIds[${j}]`,
            message: `item "${id}" is ${level}, above the exercise level ${ex.level}`,
          });
        }
      });
      if (ex.type === "reading") {
        const level = passageLevel.get(ex.passageId);
        if (level !== undefined && level !== ex.level) {
          errors.push({
            file,
            path: `exercises[${i}].passageId`,
            message: `passage "${ex.passageId}" is ${level} but the reading exercise is ${ex.level}`,
          });
        }
      }
    });
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
