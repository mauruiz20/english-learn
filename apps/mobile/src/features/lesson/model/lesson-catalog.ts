import type { Exercise, Lesson, Level } from "@english-learn/content";
import { LEVELS } from "@english-learn/domain";

/**
 * Level used when the learner has no placement result, or when their level has no lessons
 * yet. The MVP content only covers A2 and B1.
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
 * lessons, preferring the lower one on a tie (with MVP content: A1 → A2, B2 and C1 → B1).
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

/** A lesson is done once every item it practices has a review state. */
export function isLessonDone(
  lesson: Lesson,
  exercisesById: ReadonlyMap<string, Exercise>,
  reviewedItemIds: ReadonlySet<string>,
): boolean {
  const itemIds = lessonItemIds(lesson, exercisesById);
  return itemIds.length > 0 && itemIds.every((id) => reviewedItemIds.has(id));
}
