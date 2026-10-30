import type { Level } from "../cefr";
import type { ReviewState } from "../srs";
import type { Streak } from "../streak";

export type PlacementResult = {
  readonly level: Level;
  readonly theta: number;
};

/** What a session's completion reads, inside the same transaction that writes its results. */
export type SessionSnapshot = {
  /** Stored states of the requested items (items without a state are absent). */
  readonly states: readonly ReviewState[];
  readonly streak: Streak;
};

/** Everything a finished lesson or review session writes, atomically. */
export type SessionResults = {
  /** Review states to upsert by itemId. */
  readonly states: readonly ReviewState[];
  /** Non-negative integer XP to add to the total. */
  readonly xpDelta: number;
  /** The streak after recording today's activity (replaces the stored one). */
  readonly streak: Streak;
};

export type SavedSession = {
  /** XP total after adding `results.xpDelta`. */
  readonly xp: number;
  readonly results: SessionResults;
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

  /**
   * Completes a session in ONE transaction: reads the states of `itemIds` and the streak,
   * passes them to the pure `compute`, then upserts the returned states, adds `xpDelta` and
   * stores the streak. All or nothing: if anything fails (including `compute`), nothing is
   * written, so the caller can safely retry.
   */
  saveSessionResults(
    itemIds: readonly string[],
    compute: (current: SessionSnapshot) => SessionResults,
  ): Promise<SavedSession>;

  getPlacementResult(): Promise<PlacementResult | null>;
  savePlacementResult(level: Level, theta: number): Promise<void>;
}
