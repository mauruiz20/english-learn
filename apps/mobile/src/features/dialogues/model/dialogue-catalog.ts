import type { Corpus, Dialogue } from "@english-learn/content";
import { expandAccepted, type LessonResult } from "@english-learn/domain";
import { RECAP_LIMIT, type RecapItem } from "@/features/lesson/model/lesson-recap";
import { lessonScore, type LessonScore } from "@/features/lesson/model/lesson-score";
import { dialogueTurnCount } from "./dialogue-runner";

/**
 * Dialogues in "Práctica libre": their best result (the fold's `lessonResults` under the dialogue
 * id, counted over its learner turns), where they live, and their recap.
 */

/** The best result in good replies out of the dialogue's turns; none until it is played. */
export function dialogueScore(
  dialogue: Dialogue,
  result: LessonResult | undefined,
): LessonScore | undefined {
  return lessonScore(result, dialogueTurnCount(dialogue));
}

/** "Perfecto · 6/6" or "Completado · 5/6" (a dialogue is masculine; a lesson says "Perfecta"). */
export function dialogueScoreText(score: LessonScore): string {
  return `${score.perfect ? "Perfecto" : "Completado"} · ${score.correct}/${score.total}`;
}

/** "completado sin errores: 6 de 6 respuestas buenas", for an accessible label. */
export function dialogueScoreDescription(score: LessonScore): string {
  const how = score.perfect ? "sin errores" : "con errores";
  return `completado ${how}: ${score.correct} de ${score.total} respuestas buenas`;
}

export type DialoguePlace = {
  readonly slug: string;
  readonly collectionTitle: string;
  readonly groupTitle: string;
};

/** The collection and group that list a dialogue (for the way back). */
export function dialoguePlace(content: Corpus, dialogueId: string): DialoguePlace | undefined {
  for (const collection of content.practice) {
    for (const group of collection.groups) {
      if ("dialogueIds" in group && group.dialogueIds.includes(dialogueId)) {
        return {
          slug: collection.id.replace(/^practice\./u, ""),
          collectionTitle: collection.title,
          groupTitle: group.title,
        };
      }
    }
  }
  return undefined;
}

/**
 * "Lo nuevo de hoy" for a dialogue: the items its turns practice (in node order, at most
 * `RECAP_LIMIT`), each with the item's own example or the model reply of its turn (linked to a
 * study card of the dialogue that lists it), then the dialogue's other study cards.
 */
export function dialogueRecap(dialogue: Dialogue, content: Corpus): RecapItem[] {
  const cards = (dialogue.cardIds ?? []).flatMap((id) => {
    const card = content.cardsById.get(id);
    return card === undefined ? [] : [card];
  });
  const linked = new Set<string>();
  const items: RecapItem[] = [];
  const seen = new Set<string>();
  for (const node of dialogue.nodes) {
    if (node.kind !== "choose" && node.kind !== "write") continue;
    const reply =
      node.kind === "choose"
        ? node.options.find((o) => o.rating === "good")?.en
        : expandAccepted(node.accepted)[0];
    for (const id of node.itemIds ?? []) {
      const item = content.itemsById.get(id);
      if (item === undefined || seen.has(id) || items.length >= RECAP_LIMIT) continue;
      seen.add(id);
      const card = cards.find((c) => c.itemIds.includes(id));
      if (card !== undefined) linked.add(card.id);
      const example = item.example ?? (reply === undefined ? undefined : { en: reply });
      items.push({
        id,
        term: item.term,
        es: item.es,
        ...(card === undefined ? {} : { card: { id: card.id, title: card.title } }),
        ...(card === undefined && example !== undefined ? { example } : {}),
      });
    }
  }
  const others: RecapItem[] = cards
    .filter((card) => !linked.has(card.id))
    .map((card) => ({
      id: card.id,
      term: card.title,
      es: card.summary,
      card: { id: card.id, title: card.title },
    }));
  return [...items, ...others];
}
