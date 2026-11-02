import type { Corpus, Exercise, Item, Lesson } from "@english-learn/content";
import { annotateText, expandAccepted } from "@english-learn/domain";
import { itemEntryIds } from "@/features/glossary/model/item-entries";
import { lessonExercises, lessonItemIds } from "./lesson-catalog";

/** How many items the recap shows at most. */
export const RECAP_LIMIT = 5;

/** An English sentence that uses the item, with its Spanish when the content has it. */
export type RecapExample = { readonly en: string; readonly es?: string };

/**
 * One item of "Lo nuevo de hoy": a link to the study card that teaches it, or (no card) its
 * Spanish meaning plus an example sentence from the lesson's own exercises.
 */
export type RecapItem = {
  readonly id: string;
  readonly term: string;
  /** Spanish meaning (the item's gloss). */
  readonly es: string;
  readonly card?: { readonly id: string; readonly title: string };
  readonly example?: RecapExample;
};

/**
 * The lesson's new items: its `newItemIds` when the content lists them, otherwise the items it
 * practices that no earlier lesson of the corpus practices (in order of appearance, at most
 * `RECAP_LIMIT`).
 */
export function recapItemIds(lesson: Lesson, content: Corpus): readonly string[] {
  if (lesson.newItemIds !== undefined) return lesson.newItemIds;
  const earlier = new Set<string>();
  for (const other of content.lessons) {
    if (other.id === lesson.id) break;
    for (const id of lessonItemIds(other, content.exercisesById)) earlier.add(id);
  }
  return lessonItemIds(lesson, content.exercisesById)
    .filter((id) => !earlier.has(id))
    .slice(0, RECAP_LIMIT);
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The full English sentence an exercise is about, with its Spanish if known. */
function exampleOf(exercise: Exercise): RecapExample | null {
  switch (exercise.type) {
    case "translation_choice": {
      const es = exercise.options[exercise.answerIndex];
      return es === undefined ? { en: exercise.sentence } : { en: exercise.sentence, es };
    }
    case "translate_write": {
      const [en] = expandAccepted(exercise.accepted);
      return en === undefined ? null : { en, es: exercise.es };
    }
    case "cloze": {
      const [answer] = exercise.answers;
      if (answer === undefined) return null;
      const en = capitalize(exercise.sentence.replace("___", answer));
      return exercise.es === undefined ? { en } : { en, es: exercise.es };
    }
    case "word_order": {
      const [accepted] = exercise.accepted;
      if (accepted === undefined) return null;
      const en = capitalize(accepted);
      return exercise.es === undefined ? { en } : { en, es: exercise.es };
    }
    default:
      // Vocab has no sentence; a reading's passage is too long for a recap line.
      return null;
  }
}

/** Sentences with a translation first, then the exercises that practice fewer items. */
function exampleRank(exercise: Exercise, example: RecapExample): number {
  return (example.es === undefined ? 100 : 0) + exercise.itemIds.length;
}

type Candidate = { readonly example: RecapExample; readonly rank: number };

/** Whether `en` links one of `entries` (no entries: a grammar item, any sentence counts). */
function usesEntry(en: string, entries: ReadonlySet<string>, content: Corpus): boolean {
  if (entries.size === 0) return true;
  return annotateText(en, content.glossaryIndex).some(
    (s) => s.entryId !== null && entries.has(s.entryId),
  );
}

/** Example sentences of the exercises that practice the item, best first. */
function exerciseCandidates(itemId: string, exercises: readonly Exercise[]): Candidate[] {
  return exercises
    .filter((e) => e.itemIds.includes(itemId))
    .flatMap((exercise) => {
      const example = exampleOf(exercise);
      return example === null ? [] : [{ example, rank: exampleRank(exercise, example) }];
    })
    .sort((a, b) => a.rank - b.rank);
}

/**
 * The item's example: the one the content gives it, or else a sentence of an exercise that
 * practices it, with its Spanish translation and linking the item's own glossary entry (so the
 * word is really in it; for a grammar item any sentence counts): the lesson's exercises
 * first (fewest items first), then the rest of the corpus. None found → no example.
 */
function bestExample(
  item: Item,
  lessonOnes: readonly Exercise[],
  content: Corpus,
): RecapExample | undefined {
  if (item.example !== undefined) return item.example;
  // A grammar item is a structure, not a word: every exercise that practices it shows it.
  const entries = new Set(
    item.kind === "grammar" ? [] : itemEntryIds(item.term, content.glossaryIndex),
  );
  const others = content.exercises.filter((e) => !lessonOnes.includes(e));
  for (const exercises of [lessonOnes, others]) {
    const found = exerciseCandidates(item.id, exercises).find(
      (c) => c.example.es !== undefined && usesEntry(c.example.en, entries, content),
    );
    if (found !== undefined) return found.example;
  }
  return undefined;
}

/** "Lo nuevo de hoy" for a lesson: its new items with their card, or meaning and example. */
export function lessonRecap(lesson: Lesson, content: Corpus): RecapItem[] {
  const exercises = lessonExercises(lesson, content.exercisesById);
  return recapItemIds(lesson, content).flatMap((id) => {
    const item = content.itemsById.get(id);
    if (item === undefined) return [];
    const base = { id: item.id, term: item.term, es: item.es };
    const card = content.cards.find((c) => c.itemIds.includes(id));
    if (card !== undefined) return [{ ...base, card: { id: card.id, title: card.title } }];
    const example = bestExample(item, exercises, content);
    return [example === undefined ? base : { ...base, example }];
  });
}
