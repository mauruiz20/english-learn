import type { LoadedFile, Rule, ValidationError } from "./types";

/** exercise.itemIds -> items, reading.passageId -> passages, lesson.exerciseIds -> exercises. */
export const validateReferences: Rule = (files: readonly LoadedFile[]) => {
  const ids = (kind: "items" | "passages" | "exercises") =>
    new Set(files.flatMap((f) => (f.data[kind] ?? []).map((e) => e.id)));
  const items = ids("items");
  const passages = ids("passages");
  const exercises = ids("exercises");

  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    (data.exercises ?? []).forEach((ex, i) => {
      ex.itemIds.forEach((id, j) => {
        if (!items.has(id)) {
          errors.push({
            file,
            path: `exercises[${i}].itemIds[${j}]`,
            message: `unknown item id "${id}"`,
          });
        }
      });
      if (ex.type === "reading" && !passages.has(ex.passageId)) {
        errors.push({
          file,
          path: `exercises[${i}].passageId`,
          message: `unknown passage id "${ex.passageId}"`,
        });
      }
    });
    (data.lessons ?? []).forEach((lesson, i) => {
      lesson.exerciseIds.forEach((id, j) => {
        if (!exercises.has(id)) {
          errors.push({
            file,
            path: `lessons[${i}].exerciseIds[${j}]`,
            message: `unknown exercise id "${id}"`,
          });
        }
      });
    });
  }
  return errors;
};
