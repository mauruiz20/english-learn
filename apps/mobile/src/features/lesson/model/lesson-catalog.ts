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
 * The level the path follows on its own:
 *
 * 1. It starts at the placement's lesson level (`lessonLevelFor`; A2 without a placement).
 * 2. If the learner started the nearest lower level with lessons (at least one lesson done)
 *    and has not finished it, it starts there instead: their progress counts more than a newer
 *    placement or new content (a B2 or C1 placement mapped to B1 until B2 had lessons).
 * 3. From there it moves up past every finished level to the first one with lessons left
 *    (A2 → B1 → B2); with every level done it stays on the last one.
 *
 * A new learner (nothing done) is never placed below their placement.
 */
export function autoPathLevel(
  lessons: readonly Lesson[],
  level: Level | null,
  isDone: (lesson: Lesson) => boolean,
): Level {
  const levels = pathLevels(lessons, isDone);
  let index = levels.findIndex((l) => l.level === lessonLevelFor(lessons, level));
  if (index === -1) return DEFAULT_LEVEL;
  const below = levels[index - 1];
  if (below !== undefined && below.done > 0 && below.done < below.total) index -= 1;
  while (index < levels.length - 1 && levels[index]!.done === levels[index]!.total) index += 1;
  return levels[index]!.level;
}

/**
 * The lessons home shows on the path: those of the level the learner chose by hand (`chosen`),
 * even once it is finished, or else those of `autoPathLevel`. A chosen level without lessons
 * counts as no choice.
 */
export function pathLessons(
  lessons: readonly Lesson[],
  level: Level | null,
  isDone: (lesson: Lesson) => boolean,
  chosen: Level | null = null,
): { level: Level; lessons: Lesson[] } {
  const ofChosen = lessons.filter((l) => l.level === chosen);
  if (chosen !== null && ofChosen.length > 0) return { level: chosen, lessons: ofChosen };
  const target = autoPathLevel(lessons, level, isDone);
  return { level: target, lessons: lessons.filter((l) => l.level === target) };
}

/** Each level with lessons, in CEFR order, with how many of its lessons are done. */
export function pathLevels(
  lessons: readonly Lesson[],
  isDone: (lesson: Lesson) => boolean,
): { level: Level; done: number; total: number }[] {
  return LEVELS.flatMap((level) => {
    const ofLevel = lessons.filter((l) => l.level === level);
    if (ofLevel.length === 0) return [];
    return [{ level, done: ofLevel.filter(isDone).length, total: ofLevel.length }];
  });
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
