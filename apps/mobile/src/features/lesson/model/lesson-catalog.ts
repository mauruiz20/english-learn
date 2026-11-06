import type { Exercise, Lesson, Level } from "@english-learn/content";
import { LEVELS } from "@english-learn/domain";

/**
 * Level used when the learner has no placement result, or when there are no lessons at all.
 * A learner with no placement starts on A2, as before A1 had lessons.
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
 * lessons, preferring the lower one on a tie (A1 → A2 while A1 has no lessons, C1 → B2 while
 * C1 has none).
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
 *    Otherwise, if they have done nothing of that level but started the next one up, it starts
 *    there (an A1 placement mapped to A2 until A1 had lessons: they stay on the A2 they began).
 * 3. From there it moves up past every finished level to the first one with lessons left
 *    (A1 → A2 → B1 → B2 → C1); with every level done it stays on the last one.
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
  const above = levels[index + 1];
  if (below !== undefined && below.done > 0 && below.done < below.total) index -= 1;
  else if (levels[index]!.done === 0 && above !== undefined && above.done > 0) index += 1;
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
