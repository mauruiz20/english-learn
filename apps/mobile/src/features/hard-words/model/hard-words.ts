import type { Corpus, Exercise } from "@english-learn/content";
import {
  bucketCounts,
  classifyItems,
  hardItems,
  type BucketCounts,
  type ItemHistory,
  type ReviewState,
  type Rng,
} from "@english-learn/domain";
import type { CardRef } from "@/features/cards/model/card-catalog";
import { speakableTerm } from "@/features/pronunciation/model/speakable-text";
import { pickReviewExercises } from "@/features/review/model/review-plan";

/** Most exercises one "Practicar mis palabras difíciles" session serves. */
export const HARD_PRACTICE_MAX_EXERCISES = 10;

/** A difficult word as `/progreso` lists it. */
export type HardWord = {
  readonly itemId: string;
  readonly term: string;
  readonly es: string;
  /** What the speaker says (the term without notation); empty: nothing to say. */
  readonly speakText: string;
  /** The study card that teaches it ("Ver ficha"), if any. */
  readonly card: CardRef | undefined;
  readonly lapses: number;
  /** Share of correct answers among its latest ones; `null` without history. */
  readonly recentAccuracy: number | null;
};

export type ProgressOverview = {
  readonly counts: BucketCounts;
  /** Difficult words, hardest first (`hardItems`). */
  readonly hardWords: readonly HardWord[];
};

const cardByItemCache = new WeakMap<Corpus, ReadonlyMap<string, CardRef>>();

/** Item id → the first card (file order) that teaches it. Built once per corpus. */
function cardByItemId(content: Corpus): ReadonlyMap<string, CardRef> {
  const cached = cardByItemCache.get(content);
  if (cached !== undefined) return cached;
  const byItem = new Map<string, CardRef>();
  for (const card of content.cards) {
    for (const id of card.itemIds) {
      if (!byItem.has(id)) byItem.set(id, { id: card.id, title: card.title });
    }
  }
  cardByItemCache.set(content, byItem);
  return byItem;
}

/**
 * The buckets (Dominadas / En proceso / Difíciles, the domain's `classifyItems`) of the reviewed
 * items the content knows, and the difficult ones as words to show.
 */
export function progressOverview({
  states,
  histories,
  content,
}: {
  states: readonly ReviewState[];
  histories: readonly ItemHistory[];
  content: Corpus;
}): ProgressOverview {
  const known = states.filter((s) => content.itemsById.has(s.itemId));
  const classified = classifyItems(known, histories);
  const cards = cardByItemId(content);
  const hardWords = hardItems(classified).flatMap((d): HardWord[] => {
    const item = content.itemsById.get(d.itemId);
    if (item === undefined) return [];
    return [
      {
        itemId: item.id,
        term: item.term,
        es: item.es,
        speakText: speakableTerm(item.term),
        card: cards.get(item.id),
        lapses: d.lapses,
        recentAccuracy: d.recentAccuracy,
      },
    ];
  });
  return { counts: bucketCounts(classified), hardWords };
}

/**
 * A practice of the difficult items: one exercise per item in the given order (hardest first),
 * picked like the daily review (`pickReviewExercises`), at most `HARD_PRACTICE_MAX_EXERCISES`.
 * `itemIds` are the difficult items those exercises cover: the ones the session saves (other
 * items an exercise also practices are left untouched, as in the review).
 */
export function planHardPractice({
  hardItemIds,
  exercises,
  rng,
}: {
  hardItemIds: readonly string[];
  exercises: readonly Exercise[];
  rng: Rng;
}): { readonly itemIds: readonly string[]; readonly exercises: readonly Exercise[] } {
  const picked = pickReviewExercises({ itemIds: hardItemIds, exercises, rng }).slice(
    0,
    HARD_PRACTICE_MAX_EXERCISES,
  );
  const covered = new Set(picked.flatMap((e) => e.itemIds));
  return { itemIds: hardItemIds.filter((id) => covered.has(id)), exercises: picked };
}

/** The summary's line: how many of the practiced difficult words left Difíciles. */
export function hardPracticeNote({
  practiced,
  movedOut,
}: {
  readonly practiced: number;
  readonly movedOut: number;
}): string | undefined {
  if (practiced === 0) return undefined;
  if (movedOut === 0) return "Tus palabras siguen en Difíciles: vuelve a practicarlas pronto.";
  // "Salieron de Difíciles": true whether they went to En proceso or Dominadas.
  const words = practiced === 1 ? "palabra" : "palabras";
  const verb = movedOut === 1 ? "salió" : "salieron";
  return `${movedOut} de ${practiced} ${words} ${verb} de Difíciles.`;
}
