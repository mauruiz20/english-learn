import type { Level } from "../cefr";
import type { ReviewState } from "../srs";
import type { Streak } from "../streak";

export type PlacementResult = {
  readonly level: Level;
  readonly theta: number;
};

/** Persistence of the learner's progress. Implemented by the app layer (e.g. SQLite). */
export interface ProgressRepository {
  /** All stored review states, or only those for `itemIds` when given. */
  getReviewStates(itemIds?: readonly string[]): Promise<readonly ReviewState[]>;
  /** Upserts the given states by itemId. */
  saveReviewStates(states: readonly ReviewState[]): Promise<void>;

  /** The stored streak, or EMPTY_STREAK when none exists. */
  getStreak(): Promise<Streak>;
  saveStreak(streak: Streak): Promise<void>;

  getXp(): Promise<number>;
  /** Adds `amount` to the XP total and resolves to the new total. */
  addXp(amount: number): Promise<number>;

  getPlacementResult(): Promise<PlacementResult | null>;
  savePlacementResult(level: Level, theta: number): Promise<void>;
}
