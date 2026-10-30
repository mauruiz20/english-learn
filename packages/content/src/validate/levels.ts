import { LEVELS, type Level } from "../schema";
import type { LoadedFile, Rule, ValidationError } from "./types";

const dirLevel = (file: string): Level | undefined => {
  const dir = file.split("/")[0]?.toUpperCase();
  return LEVELS.find((l) => l === dir);
};

/**
 * - An exercise has the same level as each lesson that contains it.
 * - Everything under data/<level>/ has that level (data/placement is exempt).
 * - An id's level prefix matches the entity's level field.
 */
export const validateLevels: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  const exerciseLevel = new Map<string, Level>();
  for (const { data } of files)
    for (const e of data.exercises ?? []) exerciseLevel.set(e.id, e.level);

  for (const { file, data } of files) {
    const expected = dirLevel(file);
    const kinds = ["items", "exercises", "passages", "lessons"] as const;
    for (const kind of kinds) {
      (data[kind] ?? []).forEach((entity, i) => {
        if (expected && entity.level !== expected) {
          errors.push({
            file,
            path: `${kind}[${i}].level`,
            message: `level ${entity.level} does not match directory level ${expected}`,
          });
        }
        if (!entity.id.startsWith(`${entity.level.toLowerCase()}.`)) {
          errors.push({
            file,
            path: `${kind}[${i}].id`,
            message: `id "${entity.id}" does not start with its level "${entity.level.toLowerCase()}."`,
          });
        }
      });
    }
    (data.placement ?? []).forEach((q, i) => {
      if (!q.id.startsWith(`placement.${q.level.toLowerCase()}.`)) {
        errors.push({
          file,
          path: `placement[${i}].id`,
          message: `id "${q.id}" does not start with "placement.${q.level.toLowerCase()}."`,
        });
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
