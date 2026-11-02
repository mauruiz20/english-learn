import type { Exercise } from "../schema";
import { duplicateErrors } from "./helpers";
import type { LoadedFile, Rule, ValidationError } from "./types";

function exercisesById(files: readonly LoadedFile[]): Map<string, Exercise> {
  return new Map(files.flatMap((f) => (f.data.exercises ?? []).map((e) => [e.id, e] as const)));
}

/** Distinct items the lesson's exercises practice (unknown exercise ids are skipped). */
function lessonItems(exerciseIds: readonly string[], byId: ReadonlyMap<string, Exercise>) {
  return new Set(exerciseIds.flatMap((id) => byId.get(id)?.itemIds ?? []));
}

/**
 * `lesson.newItemIds` (the end-of-lesson recap): no duplicates, and every id is an item that an
 * exercise of the lesson practices (so the lesson itself schedules it for review).
 */
export const validateLessonNewItems: Rule = (files) => {
  const byId = exercisesById(files);
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    (data.lessons ?? []).forEach((lesson, i) => {
      const newItemIds = lesson.newItemIds ?? [];
      const base = `lessons[${i}].newItemIds`;
      errors.push(...duplicateErrors(newItemIds, "exact", "new item", file, base));
      const practiced = lessonItems(lesson.exerciseIds, byId);
      newItemIds.forEach((id, j) => {
        if (practiced.has(id)) return;
        errors.push({
          file,
          path: `${base}[${j}]`,
          message: `new item "${id}" is not practiced by any exercise of the lesson`,
        });
      });
    });
  }
  return errors;
};

/**
 * Every item a lesson practices is also practiced by some non-reading exercise of the corpus: the
 * daily review skips reading (too long for a quick review), so an item only a reading covers
 * would get a review state from the lesson and never come back.
 */
export const validateReviewableLessonItems: Rule = (files) => {
  const byId = exercisesById(files);
  const reviewable = new Set(
    [...byId.values()].filter((e) => e.type !== "reading").flatMap((e) => e.itemIds),
  );
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    (data.lessons ?? []).forEach((lesson, i) => {
      for (const id of lessonItems(lesson.exerciseIds, byId)) {
        if (reviewable.has(id)) continue;
        errors.push({
          file,
          path: `lessons[${i}]`,
          message: `item "${id}" is only practiced by reading exercises, so the daily review can never bring it back; add a non-reading exercise for it`,
        });
      }
    });
  }
  return errors;
};
