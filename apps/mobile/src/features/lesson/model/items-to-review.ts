import type { Item } from "@english-learn/content";
import type { ItemOutcome } from "./lesson-session";

/** A word or phrase to look at again, as shown on the summary page. */
export type ReviewNote = Pick<Item, "id" | "term" | "es">;

/** How many items the summary lists at most. */
export const REVIEW_NOTES_LIMIT = 6;

/**
 * The items the learner missed (wrong or almost) in a session, once each, in the order they
 * came up, up to `limit`. Items missing from the corpus are skipped.
 */
export function itemsToReview(
  outcomes: readonly ItemOutcome[],
  itemsById: ReadonlyMap<string, Item>,
  limit: number = REVIEW_NOTES_LIMIT,
): ReviewNote[] {
  const notes: ReviewNote[] = [];
  const seen = new Set<string>();
  for (const { itemId, verdict } of outcomes) {
    if (notes.length >= limit) break;
    if (verdict === "correct" || seen.has(itemId)) continue;
    const item = itemsById.get(itemId);
    if (item === undefined) continue;
    seen.add(itemId);
    notes.push({ id: item.id, term: item.term, es: item.es });
  }
  return notes;
}
