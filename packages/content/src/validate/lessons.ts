import { LEVELS, type Exercise, type Level } from "../schema";
import { duplicateErrors } from "./helpers";
import { isPracticeFile } from "./practice";
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

/**
 * `lesson.deepenCardIds` (the "Profundiza" step on the path): no duplicates, every id is a card,
 * and every card is at or below the lesson level (A1 < A2 < B1 < B2 < C1).
 */
export const validateLessonDeepenCards: Rule = (files) => {
  const cardLevel = new Map<string, Level>(
    files.flatMap((f) => (f.data.cards ?? []).map((c) => [c.id, c.level] as const)),
  );
  const rank = (l: Level) => LEVELS.indexOf(l);
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    (data.lessons ?? []).forEach((lesson, i) => {
      const ids = lesson.deepenCardIds ?? [];
      const base = `lessons[${i}].deepenCardIds`;
      errors.push(...duplicateErrors(ids, "exact", "linked card", file, base));
      ids.forEach((id, j) => {
        const level = cardLevel.get(id);
        const path = `${base}[${j}]`;
        if (level === undefined) {
          errors.push({ file, path, message: `card "${id}" does not exist` });
        } else if (rank(level) > rank(lesson.level)) {
          errors.push({
            file,
            path,
            message: `card "${id}" is ${level}, above the lesson level ${lesson.level}`,
          });
        }
      });
    });
  }
  return errors;
};

/**
 * A card is linked by at most one lesson of a topic (same level and `topic`): the lesson that
 * teaches it. Otherwise the path shows the same "Profundiza" card under consecutive lessons.
 * Lessons of other topics may still link it. The later link is reported.
 */
export const validateTopicDeepenCards: Rule = (files) => {
  const firstLinker = new Map<string, string>();
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    // Practice lessons are not on the path: each one may link the cards it practices.
    if (isPracticeFile(file)) continue;
    (data.lessons ?? []).forEach((lesson, i) => {
      (lesson.deepenCardIds ?? []).forEach((id, j) => {
        const key = `${lesson.level}|${lesson.topic}|${id}`;
        const linker = firstLinker.get(key);
        if (linker === undefined) {
          firstLinker.set(key, lesson.id);
          return;
        }
        if (linker === lesson.id) return; // a duplicate inside one lesson is rule 21
        errors.push({
          file,
          path: `lessons[${i}].deepenCardIds[${j}]`,
          message: `card "${id}" is already linked by "${linker}", a lesson of the same topic; link it to the lesson that teaches it`,
        });
      });
    });
  }
  return errors;
};
