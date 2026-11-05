import type { Exercise, Lesson, Level } from "@english-learn/content";
import { LEVELS } from "@english-learn/domain";

/**
 * Level used when the learner has no placement result, or when their level has no lessons
 * yet. The bundled content covers A2, B1 and B2.
 */
export const DEFAULT_LEVEL: Level = "A2";

/** The lesson's exercises in lesson order; unknown ids are skipped (content is validated in CI). */
export function lessonExercises(
  lesson: Lesson,
  exercisesById: ReadonlyMap<string, Exercise>,
): Exercise[] {
  return lesson.exerciseIds.flatMap((id) => {
    const exercise = exercisesById.get(id);
    return exercise === undefined ? [] : [exercise];
  });
}

/** Distinct item ids practiced by the lesson, in order of first appearance. */
export function lessonItemIds(
  lesson: Lesson,
  exercisesById: ReadonlyMap<string, Exercise>,
): string[] {
  return [...new Set(lessonExercises(lesson, exercisesById).flatMap((e) => e.itemIds))];
}

/**
 * The level whose lessons a learner at `level` should take: the nearest level that has
 * lessons, preferring the lower one on a tie (with the bundled content: A1 → A2, C1 → B2).
 * No level yet, or no lessons at all → `DEFAULT_LEVEL`.
 */
export function lessonLevelFor(lessons: readonly Lesson[], level: Level | null): Level {
  if (level === null) return DEFAULT_LEVEL;
  const withLessons = new Set(lessons.map((l) => l.level));
  const rank = LEVELS.indexOf(level);
  for (let distance = 0; distance < LEVELS.length; distance++) {
    for (const candidate of [LEVELS[rank - distance], LEVELS[rank + distance]]) {
      if (candidate !== undefined && withLessons.has(candidate)) return candidate;
    }
  }
  return DEFAULT_LEVEL;
}

/** The lessons a learner at `level` should take (see `lessonLevelFor`). */
export function lessonsForLevel(
  lessons: readonly Lesson[],
  level: Level | null,
): { level: Level; lessons: Lesson[] } {
  const target = lessonLevelFor(lessons, level);
  return { level: target, lessons: lessons.filter((l) => l.level === target) };
}

/**
 * The lessons home shows on the path: those of the placement's lesson level (`lessonLevelFor`),
 * moving on to the next level with lessons once every lesson of a level is done (A2 → B1 → B2).
 * When every level is done the path stays on the last one; it never goes below the placement.
 */
export function pathLessons(
  lessons: readonly Lesson[],
  level: Level | null,
  isDone: (lesson: Lesson) => boolean,
): { level: Level; lessons: Lesson[] } {
  let current = lessonsForLevel(lessons, level);
  const start = LEVELS.indexOf(current.level);
  for (const next of LEVELS.slice(start + 1)) {
    if (!current.lessons.every(isDone)) break;
    const ofNext = lessons.filter((l) => l.level === next);
    if (ofNext.length > 0) current = { level: next, lessons: ofNext };
  }
  return current;
}

/** A lesson is done once every item it practices has a review state. */
export function isLessonDone(
  lesson: Lesson,
  exercisesById: ReadonlyMap<string, Exercise>,
  reviewedItemIds: ReadonlySet<string>,
): boolean {
  const itemIds = lessonItemIds(lesson, exercisesById);
  return itemIds.length > 0 && itemIds.every((id) => reviewedItemIds.has(id));
}
