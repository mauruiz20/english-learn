import type { Card, CardKind, Corpus, Exercise } from "@english-learn/content";
import {
  LEVELS,
  levelProgress,
  type LessonResult,
  type Level,
  type ReviewState,
} from "@english-learn/domain";
import { lessonScore, type LessonScore } from "@/features/lesson/model/lesson-score";
import { topicLabel } from "@/features/topics/topic-labels";

/**
 * - new: some item it teaches was never reviewed.
 * - studied: every item has a review state (practicing the card gives them all one).
 * - mastered: every item reached the mastery interval (`levelProgress`, 21 days).
 */
export type CardStatus = "new" | "studied" | "mastered";

export type CardRow = {
  readonly id: string;
  readonly title: string;
  readonly level: Level;
  readonly status: CardStatus;
  /** Its best practice result; none if never practiced. */
  readonly score?: LessonScore;
};

export type CardGroup = {
  readonly kind: CardKind;
  readonly topic: Card["topic"];
  /** The topic's Spanish name ("Gramática"). */
  readonly label: string;
  readonly levels: readonly { readonly level: Level; readonly cards: readonly CardRow[] }[];
};

/** The order of the list: grammar, then phrasal verbs, then vocabulary. */
const KIND_ORDER: readonly CardKind[] = ["grammar", "phrasal_verbs", "vocabulary"];

export function cardStatus(card: Card, states: readonly ReviewState[]): CardStatus {
  const reviewed = new Set(states.map((s) => s.itemId));
  if (!card.itemIds.every((id) => reviewed.has(id))) return "new";
  const { mastered, total } = levelProgress({ itemIds: card.itemIds, states });
  return mastered === total ? "mastered" : "studied";
}

/**
 * Card id → its best practice result. Practice is saved as a lesson whose id is the card's, so
 * the fold's lesson results already hold it; counted over the card's exercises like a lesson.
 */
export function cardScores(
  content: Pick<Corpus, "cards" | "exercisesById">,
  results: readonly LessonResult[],
): ReadonlyMap<string, LessonScore> {
  const resultById = new Map(results.map((r) => [r.lessonId, r]));
  const scores = new Map<string, LessonScore>();
  for (const card of content.cards) {
    const score = lessonScore(
      resultById.get(card.id),
      cardExercises(card, content.exercisesById).length,
    );
    if (score !== undefined) scores.set(card.id, score);
  }
  return scores;
}

/** The cards by kind, then by level (A1 → C1), in file order inside a level. */
export function cardGroups(
  cards: readonly Card[],
  states: readonly ReviewState[],
  scores: ReadonlyMap<string, LessonScore> = new Map(),
): CardGroup[] {
  return KIND_ORDER.flatMap((kind) => {
    const ofKind = cards.filter((c) => c.kind === kind);
    const first = ofKind[0];
    if (first === undefined) return [];
    return [
      {
        kind,
        topic: first.topic,
        label: topicLabel(first.topic),
        levels: LEVELS.flatMap((level) => {
          const rows = ofKind
            .filter((c) => c.level === level)
            .map((c): CardRow => {
              const score = scores.get(c.id);
              return {
                id: c.id,
                title: c.title,
                level: c.level,
                status: cardStatus(c, states),
                ...(score === undefined ? {} : { score }),
              };
            });
          return rows.length === 0 ? [] : [{ level, cards: rows }];
        }),
      },
    ];
  });
}

/** How many cards there are and how many were studied (mastered ones included). */
export function cardsSummary(
  cards: readonly Card[],
  states: readonly ReviewState[],
): { readonly total: number; readonly studied: number } {
  return {
    total: cards.length,
    studied: cards.filter((c) => cardStatus(c, states) !== "new").length,
  };
}

/** The card's practice exercises, in order (unknown ids skipped). */
export function cardExercises(
  card: Card,
  exercisesById: ReadonlyMap<string, Exercise>,
): Exercise[] {
  return card.exerciseIds.flatMap((id) => {
    const exercise = exercisesById.get(id);
    return exercise === undefined ? [] : [exercise];
  });
}

export type CardRef = { readonly id: string; readonly title: string };

const byExerciseCache = new WeakMap<Corpus, ReadonlyMap<string, CardRef>>();

/**
 * Exercise id → the card that explains it: the card it practices, or the card that teaches one
 * of its items (lesson exercises can practice card items). Built once per corpus.
 */
export function cardByExerciseId(content: Corpus): ReadonlyMap<string, CardRef> {
  const cached = byExerciseCache.get(content);
  if (cached !== undefined) return cached;
  const byItem = new Map<string, CardRef>();
  const result = new Map<string, CardRef>();
  for (const card of content.cards) {
    const ref = { id: card.id, title: card.title };
    for (const id of card.itemIds) if (!byItem.has(id)) byItem.set(id, ref);
    for (const id of card.exerciseIds) result.set(id, ref);
  }
  for (const exercise of content.exercises) {
    if (result.has(exercise.id)) continue;
    const ref = exercise.itemIds.map((id) => byItem.get(id)).find((r) => r !== undefined);
    if (ref !== undefined) result.set(exercise.id, ref);
  }
  byExerciseCache.set(content, result);
  return result;
}
