import { compareLocalDate, type LocalDate } from "../local-date";
import type { ReviewState } from "./sm2";

export type SessionInput = {
  readonly states: readonly ReviewState[];
  readonly today: LocalDate;
  readonly newItemIds: readonly string[];
  readonly maxReviews: number;
  readonly maxNew: number;
};

export type SessionPlan = {
  readonly reviews: readonly string[];
  readonly fresh: readonly string[];
};

function byPriority(a: ReviewState, b: ReviewState): number {
  return (
    compareLocalDate(a.dueDate, b.dueDate) ||
    b.lapses - a.lapses ||
    (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0)
  );
}

/**
 * Plans a study session: due reviews first (most overdue, then most lapsed, then by id),
 * then new items that have never been reviewed, in the given order.
 */
export function selectSession({
  states,
  today,
  newItemIds,
  maxReviews,
  maxNew,
}: SessionInput): SessionPlan {
  const reviews = states
    .filter((s) => compareLocalDate(s.dueDate, today) <= 0)
    .sort(byPriority)
    .slice(0, Math.max(0, maxReviews))
    .map((s) => s.itemId);

  const known = new Set(states.map((s) => s.itemId));
  const fresh = [...new Set(newItemIds)]
    .filter((id) => !known.has(id))
    .slice(0, Math.max(0, maxNew));

  return { reviews, fresh };
}
