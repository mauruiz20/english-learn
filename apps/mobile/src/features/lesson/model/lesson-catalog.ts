import type { Exercise, Lesson, Level } from "@english-learn/content";

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

/** Lessons for `level`, falling back to `DEFAULT_LEVEL` when there is no level or no lesson. */
export function lessonsForLevel(
  lessons: readonly Lesson[],
  level: Level | null,
): { level: Level; lessons: Lesson[] } {
  const atLevel = level === null ? [] : lessons.filter((l) => l.level === level);
  if (level !== null && atLevel.length > 0) return { level, lessons: atLevel };
  return { level: DEFAULT_LEVEL, lessons: lessons.filter((l) => l.level === DEFAULT_LEVEL) };
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
