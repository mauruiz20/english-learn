/**
 * Runtime view of the whole content corpus. Type-only imports keep Zod out of
 * any bundle that only needs the data (the app imports `@english-learn/content/corpus`).
 * The glossary index comes from `@english-learn/domain`, which has no dependencies.
 */
import { buildGlossaryIndex, type GlossaryEntry, type GlossaryIndex } from "@english-learn/domain";
import type { ContentFile } from "../schema/content-file";
import type { Card } from "../schema/card";
import type { Dialogue } from "../schema/dialogue";
import type { Item, Lesson, Passage } from "../schema/entities";
import type { Exercise } from "../schema/exercise";
import type { PlacementQuestion } from "../schema/placement";
import type { PracticeCollection } from "../schema/practice";

export type Corpus = {
  readonly items: readonly Item[];
  readonly exercises: readonly Exercise[];
  readonly passages: readonly Passage[];
  /** The learning path's lessons (never the practice lessons). */
  readonly lessons: readonly Lesson[];
  readonly placement: readonly PlacementQuestion[];
  readonly itemsById: ReadonlyMap<string, Item>;
  readonly exercisesById: ReadonlyMap<string, Exercise>;
  readonly passagesById: ReadonlyMap<string, Passage>;
  readonly lessonsById: ReadonlyMap<string, Lesson>;
  /** "Práctica libre" collections, in file order, with their groups in display order. */
  readonly practice: readonly PracticeCollection[];
  /** The lessons the practice groups list: kept apart, so path counts never include them. */
  readonly practiceLessons: readonly Lesson[];
  readonly practiceLessonsById: ReadonlyMap<string, Lesson>;
  /** Interactive dialogues ("Diálogos", a practice collection), in file order. */
  readonly dialogues: readonly Dialogue[];
  readonly dialoguesById: ReadonlyMap<string, Dialogue>;
  /** Study cards ("Fichas"), in file order. */
  readonly cards: readonly Card[];
  readonly cardsById: ReadonlyMap<string, Card>;
  readonly glossary: readonly GlossaryEntry[];
  readonly glossaryById: ReadonlyMap<string, GlossaryEntry>;
  /** Ready-made lookup for `annotateText` (hover / tap translations). */
  readonly glossaryIndex: GlossaryIndex;
};

function byId<T extends { readonly id: string }>(entities: readonly T[]): ReadonlyMap<string, T> {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

/** Merges already-validated content files (in the given order) and indexes them by id. */
export function createCorpus(files: readonly ContentFile[]): Corpus {
  const items = files.flatMap((f) => f.items ?? []);
  const exercises = files.flatMap((f) => f.exercises ?? []);
  const passages = files.flatMap((f) => f.passages ?? []);
  const practice = files.flatMap((f) => f.practice ?? []);
  const practiceIds = new Set(
    practice.flatMap((c) => c.groups.flatMap((g) => ("lessonIds" in g ? g.lessonIds : []))),
  );
  const allLessons = files.flatMap((f) => f.lessons ?? []);
  const lessons = allLessons.filter((l) => !practiceIds.has(l.id));
  const practiceLessons = allLessons.filter((l) => practiceIds.has(l.id));
  const placement = files.flatMap((f) => f.placement ?? []);
  const cards = files.flatMap((f) => f.cards ?? []);
  const dialogues = files.flatMap((f) => f.dialogues ?? []);
  const glossary: readonly GlossaryEntry[] = files.flatMap((f) => f.glossary ?? []);
  return {
    items,
    exercises,
    passages,
    lessons,
    placement,
    itemsById: byId(items),
    exercisesById: byId(exercises),
    passagesById: byId(passages),
    lessonsById: byId(lessons),
    practice,
    practiceLessons,
    practiceLessonsById: byId(practiceLessons),
    dialogues,
    dialoguesById: byId(dialogues),
    cards,
    cardsById: byId(cards),
    glossary,
    glossaryById: byId(glossary),
    glossaryIndex: buildGlossaryIndex(glossary),
  };
}
