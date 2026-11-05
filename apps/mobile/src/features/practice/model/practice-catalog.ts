import type { Corpus, Level, PracticeCollection } from "@english-learn/content";
import type { LessonResult } from "@english-learn/domain";
import { lessonItemIds } from "@/features/lesson/model/lesson-catalog";
import { lessonScore, type LessonScore } from "@/features/lesson/model/lesson-score";

/**
 * "Práctica libre": collections of groups of lessons, outside the learning path. Everything is
 * open; a group's level is a label. Results come from the fold's `lessonResults` (a practice
 * lesson is saved as a lesson with its own id), so nothing new is stored.
 */

/** `/practica` lists one row per collection. */
export type PracticeCollectionRow = {
  /** The route segment (`phrasal-verbs`). */
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly groups: number;
  readonly lessons: number;
  /** Lessons completed at least once. */
  readonly done: number;
};

export type PracticeLessonRow = {
  readonly id: string;
  /** 1, 2, 3 within its group. */
  readonly number: number;
  /** Without the group title (`Conócelos`). */
  readonly title: string;
  readonly fullTitle: string;
  /** Its best result; none until it is completed. */
  readonly score?: LessonScore;
};

export type PracticeGroupRow = {
  readonly id: string;
  readonly level: Level;
  readonly title: string;
  readonly summary: string;
  /** The terms its first lesson introduces (`clean (something) up`), in order. */
  readonly verbs: readonly string[];
  readonly lessons: readonly PracticeLessonRow[];
};

const PREFIX = "practice.";

/** `practice.phrasal-verbs` → `phrasal-verbs`. */
export const practiceSlug = (collectionId: string): string =>
  collectionId.startsWith(PREFIX) ? collectionId.slice(PREFIX.length) : collectionId;

/** "Casa y rutina: conócelos" in the group "Casa y rutina" → "Conócelos". */
export function shortLessonTitle(lessonTitle: string, groupTitle: string): string {
  const prefix = `${groupTitle}: `;
  if (!lessonTitle.startsWith(prefix)) return lessonTitle;
  const rest = lessonTitle.slice(prefix.length);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

const resultsById = (results: readonly LessonResult[]) =>
  new Map(results.map((r) => [r.lessonId, r]));

export function practiceCollectionRows(
  content: Corpus,
  results: readonly LessonResult[],
): PracticeCollectionRow[] {
  const byId = resultsById(results);
  return content.practice.map((collection) => {
    const lessonIds = collection.groups.flatMap((g) => g.lessonIds);
    return {
      slug: practiceSlug(collection.id),
      title: collection.title,
      summary: collection.summary,
      groups: collection.groups.length,
      lessons: lessonIds.length,
      done: lessonIds.filter((id) => byId.has(id)).length,
    };
  });
}

export function practiceCollectionBySlug(
  content: Corpus,
  slug: string,
): PracticeCollection | undefined {
  return content.practice.find((c) => practiceSlug(c.id) === slug);
}

export function practiceGroupRows(
  collection: PracticeCollection,
  content: Corpus,
  results: readonly LessonResult[],
): PracticeGroupRow[] {
  const byId = resultsById(results);
  return collection.groups.map((group) => {
    const lessons = group.lessonIds.flatMap((id) => {
      const lesson = content.practiceLessonsById.get(id);
      return lesson === undefined ? [] : [lesson];
    });
    const [first] = lessons;
    const verbs =
      first === undefined
        ? []
        : lessonItemIds(first, content.exercisesById).flatMap((id) => {
            const item = content.itemsById.get(id);
            return item === undefined ? [] : [item.term];
          });
    return {
      id: group.id,
      level: group.level,
      title: group.title,
      summary: group.summary,
      verbs,
      lessons: lessons.map((lesson, i) => {
        const score = lessonScore(byId.get(lesson.id), lesson.exerciseIds.length);
        const row = {
          id: lesson.id,
          number: i + 1,
          title: shortLessonTitle(lesson.title, group.title),
          fullTitle: lesson.title,
        };
        return score === undefined ? row : { ...row, score };
      }),
    };
  });
}

/** Where a practice lesson lives: its collection (for the way back) and group. */
export type PracticeLessonPlace = {
  readonly slug: string;
  readonly collectionTitle: string;
  readonly groupTitle: string;
};

export function practiceLessonPlace(
  content: Corpus,
  lessonId: string,
): PracticeLessonPlace | undefined {
  for (const collection of content.practice) {
    const group = collection.groups.find((g) => g.lessonIds.includes(lessonId));
    if (group !== undefined) {
      return {
        slug: practiceSlug(collection.id),
        collectionTitle: collection.title,
        groupTitle: group.title,
      };
    }
  }
  return undefined;
}
