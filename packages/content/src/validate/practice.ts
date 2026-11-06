import type { Exercise, Lesson } from "../schema";
import { duplicateErrors, normalize } from "./helpers";
import type { Rule, ValidationError } from "./types";

/**
 * "Práctica libre" lives in `data/practice/<collection>/`: the collection entry (`practice`) and
 * its groups' items, exercises and lessons. Practice lessons are ordinary lessons kept out of the
 * learning path: the corpus lists them apart (`practiceLessons`), so nothing that counts the
 * path's lessons sees them.
 */
export const PRACTICE_DIR = "practice";

/** Whether a corpus-relative file is under `practice/`. */
export const isPracticeFile = (file: string): boolean => file.startsWith(`${PRACTICE_DIR}/`);

/** `practice/<collection>/x.json` -> `<collection>` (undefined outside a collection directory). */
export function practiceCollectionDir(file: string): string | undefined {
  const segments = file.split("/");
  return segments[0] === PRACTICE_DIR && segments.length >= 3 ? segments[1] : undefined;
}

const collectionSlug = (id: string) => id.slice(`${PRACTICE_DIR}.`.length);

/**
 * Per file: a collection sits in `practice/<slug>/` for its id `practice.<slug>`, its group ids
 * start with its id, and a group never lists a lesson twice.
 */
export const validatePracticeCollections: Rule = (files) => {
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    (data.practice ?? []).forEach((collection, i) => {
      const at = `practice[${i}]`;
      const slug = collectionSlug(collection.id);
      if (isPracticeFile(file) && practiceCollectionDir(file) !== slug) {
        errors.push({
          file,
          path: `${at}.id`,
          message: `collection "${collection.id}" belongs in ${PRACTICE_DIR}/${slug}/`,
        });
      }
      collection.groups.forEach((group, g) => {
        const base = `${at}.groups[${g}]`;
        if (!group.id.startsWith(`${collection.id}.`)) {
          errors.push({
            file,
            path: `${base}.id`,
            message: `group id must start with "${collection.id}."`,
          });
        }
        if ("lessonIds" in group) {
          errors.push(
            ...duplicateErrors(group.lessonIds, "exact", "lesson id", file, `${base}.lessonIds`),
          );
        } else {
          errors.push(
            ...duplicateErrors(
              group.dialogueIds,
              "exact",
              "dialogue id",
              file,
              `${base}.dialogueIds`,
            ),
          );
        }
      });
    });
  }
  return errors;
};

type LocatedLesson = { readonly file: string; readonly index: number; readonly lesson: Lesson };

/** Items a lesson's exercises practice (unknown exercise ids are skipped). */
const practicedItems = (lesson: Lesson, exercises: ReadonlyMap<string, Exercise>) =>
  new Set(lesson.exerciseIds.flatMap((id) => exercises.get(id)?.itemIds ?? []));

/** An item term without its parenthesized parts (`clean (something) up` -> `clean up`). */
const termKey = (term: string) => normalize(term.replace(/\([^)]*\)/gu, " "));

/**
 * Cross-file practice rules:
 * - collection ids and group ids are unique;
 * - every group lesson is a lesson of `practice/<its collection>/`, at the group's level, and
 *   every practice lesson is in exactly one group;
 * - practice never touches the path: no practice lesson practices an item a path lesson
 *   practices, and no practice item repeats a path item's term under another id;
 * - no lesson id is also a card id (results are kept per lesson or card id).
 */
export const validatePracticeLessons: Rule = (files) => {
  const errors: ValidationError[] = [];
  const lessons = new Map<string, LocatedLesson>();
  const exercises = new Map<string, Exercise>();
  const cardIds = new Set<string>();
  for (const { file, data } of files) {
    (data.lessons ?? []).forEach((lesson, index) => {
      if (!lessons.has(lesson.id)) lessons.set(lesson.id, { file, index, lesson });
    });
    for (const exercise of data.exercises ?? []) exercises.set(exercise.id, exercise);
    for (const card of data.cards ?? []) cardIds.add(card.id);
  }

  const collectionIds = new Set<string>();
  const groupIds = new Set<string>();
  const groupOf = new Map<string, string>();
  for (const { file, data } of files) {
    (data.practice ?? []).forEach((collection, i) => {
      const at = `practice[${i}]`;
      if (collectionIds.has(collection.id)) {
        errors.push({
          file,
          path: `${at}.id`,
          message: `duplicate collection id "${collection.id}"`,
        });
      }
      collectionIds.add(collection.id);
      const slug = collectionSlug(collection.id);
      collection.groups.forEach((group, g) => {
        const base = `${at}.groups[${g}]`;
        if (groupIds.has(group.id)) {
          errors.push({ file, path: `${base}.id`, message: `duplicate group id "${group.id}"` });
        }
        groupIds.add(group.id);
        if (!("lessonIds" in group)) return;
        group.lessonIds.forEach((id, l) => {
          const path = `${base}.lessonIds[${l}]`;
          const located = lessons.get(id);
          if (located === undefined) {
            errors.push({ file, path, message: `unknown lesson id "${id}"` });
            return;
          }
          if (practiceCollectionDir(located.file) !== slug) {
            errors.push({
              file,
              path,
              message: `lesson "${id}" is not in ${PRACTICE_DIR}/${slug}/; a group lists its collection's practice lessons only`,
            });
            return;
          }
          if (located.lesson.level !== group.level) {
            errors.push({
              file,
              path,
              message: `lesson "${id}" is ${located.lesson.level} but the group is ${group.level}`,
            });
          }
          const owner = groupOf.get(id);
          if (owner !== undefined && owner !== group.id) {
            errors.push({ file, path, message: `lesson "${id}" is already in group "${owner}"` });
          } else {
            groupOf.set(id, group.id);
          }
        });
      });
    });
  }

  const pathItems = new Set<string>();
  for (const { file, lesson } of lessons.values()) {
    if (!isPracticeFile(file))
      for (const id of practicedItems(lesson, exercises)) pathItems.add(id);
  }
  const pathTerms = new Map<string, string>();
  for (const { file, data } of files) {
    if (isPracticeFile(file)) continue;
    for (const item of data.items ?? []) {
      if (pathItems.has(item.id)) pathTerms.set(termKey(item.term), item.id);
    }
  }

  for (const { file, data } of files) {
    (data.lessons ?? []).forEach((lesson, i) => {
      if (cardIds.has(lesson.id)) {
        errors.push({
          file,
          path: `lessons[${i}].id`,
          message: `lesson id "${lesson.id}" is also a card id; lesson results are kept by id`,
        });
      }
      if (!isPracticeFile(file)) return;
      if (!groupOf.has(lesson.id)) {
        errors.push({
          file,
          path: `lessons[${i}]`,
          message: `practice lesson "${lesson.id}" is in no group`,
        });
      }
      for (const id of practicedItems(lesson, exercises)) {
        if (!pathItems.has(id)) continue;
        errors.push({
          file,
          path: `lessons[${i}]`,
          message: `practice lesson "${lesson.id}" practices "${id}", an item of the learning path; practice must never change path progress`,
        });
      }
    });
    if (!isPracticeFile(file)) continue;
    (data.items ?? []).forEach((item, i) => {
      const pathId = pathTerms.get(termKey(item.term));
      if (pathId === undefined || pathId === item.id) return;
      errors.push({
        file,
        path: `items[${i}].term`,
        message: `practice item "${item.id}" repeats "${pathId}", an item of the learning path`,
      });
    });
  }
  return errors;
};
