import type { Corpus, Level, PracticeCollection, PracticeGroup } from "@english-learn/content";
import type { LessonResult } from "@english-learn/domain";
import { lessonItemIds } from "@/features/lesson/model/lesson-catalog";
import { lessonScore, type LessonScore } from "@/features/lesson/model/lesson-score";
import { dialogueScore } from "@/features/dialogues/model/dialogue-catalog";

/**
 * "Práctica libre": collections of groups of lessons, outside the learning path. Everything is
 * open; a group's level is a label. Results come from the fold's `lessonResults` (a practice
 * lesson is saved as a lesson with its own id), so nothing new is stored. The "Diálogos"
 * collection lists dialogues instead of lessons (saved the same way, under the dialogue id).
 */

/** `/practica` lists one row per collection. */
export type PracticeCollectionRow = {
  /** The route segment (`phrasal-verbs`). */
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly groups: number;
  /** Its lessons, or its dialogues for a collection of dialogues. */
  readonly lessons: number;
  /** Lessons (or dialogues) completed at least once. */
  readonly done: number;
  /** Set for a collection of dialogues. */
  readonly kind?: "dialogues";
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
  /** Set for a dialogue (it opens the dialogue screen, and its marker is masculine). */
  readonly kind?: "dialogue";
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

/** The lessons a group lists (a group of dialogues lists none). */
const groupLessonIds = (group: PracticeGroup): readonly string[] =>
  "lessonIds" in group ? group.lessonIds : [];

/** What a group lists: its lessons or its dialogues. */
const groupEntryIds = (group: PracticeGroup): readonly string[] =>
  "lessonIds" in group ? group.lessonIds : group.dialogueIds;

const isDialogueCollection = (collection: PracticeCollection) =>
  collection.groups.length > 0 && collection.groups.every((g) => "dialogueIds" in g);

const resultsById = (results: readonly LessonResult[]) =>
  new Map(results.map((r) => [r.lessonId, r]));

export function practiceCollectionRows(
  content: Corpus,
  results: readonly LessonResult[],
): PracticeCollectionRow[] {
  const byId = resultsById(results);
  return content.practice.map((collection) => {
    const ids = collection.groups.flatMap(groupEntryIds);
    const row = {
      slug: practiceSlug(collection.id),
      title: collection.title,
      summary: collection.summary,
      groups: collection.groups.length,
      lessons: ids.length,
      done: ids.filter((id) => byId.has(id)).length,
    };
    return isDialogueCollection(collection) ? { ...row, kind: "dialogues" as const } : row;
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
    if ("dialogueIds" in group) return dialogueGroupRow(group, content, byId);
    const lessons = groupLessonIds(group).flatMap((id) => {
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

/** A group of dialogues: each dialogue with its best result over its learner turns. */
function dialogueGroupRow(
  group: Extract<PracticeGroup, { dialogueIds: readonly string[] }>,
  content: Corpus,
  byId: ReadonlyMap<string, LessonResult>,
): PracticeGroupRow {
  const dialogues = group.dialogueIds.flatMap((id) => {
    const dialogue = content.dialoguesById.get(id);
    return dialogue === undefined ? [] : [dialogue];
  });
  return {
    id: group.id,
    level: group.level,
    title: group.title,
    summary: group.summary,
    verbs: [],
    lessons: dialogues.map((dialogue, i) => {
      const score = dialogueScore(dialogue, byId.get(dialogue.id));
      const row = {
        id: dialogue.id,
        number: i + 1,
        title: dialogue.title,
        fullTitle: dialogue.title,
        kind: "dialogue" as const,
      };
      return score === undefined ? row : { ...row, score };
    }),
  };
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
    const group = collection.groups.find((g) => groupLessonIds(g).includes(lessonId));
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
