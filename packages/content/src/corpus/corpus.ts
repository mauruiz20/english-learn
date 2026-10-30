/**
 * Runtime view of the whole content corpus. Type-only imports keep Zod out of
 * any bundle that only needs the data (the app imports `@english-learn/content/corpus`).
 */
import type { ContentFile } from "../schema/content-file";
import type { Item, Lesson, Passage } from "../schema/entities";
import type { Exercise } from "../schema/exercise";
import type { PlacementQuestion } from "../schema/placement";

export type Corpus = {
  readonly items: readonly Item[];
  readonly exercises: readonly Exercise[];
  readonly passages: readonly Passage[];
  readonly lessons: readonly Lesson[];
  readonly placement: readonly PlacementQuestion[];
  readonly itemsById: ReadonlyMap<string, Item>;
  readonly exercisesById: ReadonlyMap<string, Exercise>;
  readonly passagesById: ReadonlyMap<string, Passage>;
  readonly lessonsById: ReadonlyMap<string, Lesson>;
};

function byId<T extends { readonly id: string }>(entities: readonly T[]): ReadonlyMap<string, T> {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

/** Merges already-validated content files (in the given order) and indexes them by id. */
export function createCorpus(files: readonly ContentFile[]): Corpus {
  const items = files.flatMap((f) => f.items ?? []);
  const exercises = files.flatMap((f) => f.exercises ?? []);
  const passages = files.flatMap((f) => f.passages ?? []);
  const lessons = files.flatMap((f) => f.lessons ?? []);
  const placement = files.flatMap((f) => f.placement ?? []);
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
  };
}
