import type { Level } from "../cefr";
import type { CheckpointEvidence } from "../checkpoint";
import type { LocalDate } from "../local-date";
import type { ProgressEvent, StoredEvent } from "../progress-log/events";
import type { DailyExercises, ItemHistory, LessonResult } from "../progress-log/fold";
import type { ReviewState } from "../srs";
import type { Streak } from "../streak";

export type PlacementResult = {
  readonly level: Level;
  readonly theta: number;
};

/** The totals a progress screen shows after a write. */
export type ProgressTotals = {
  readonly xp: number;
  readonly streak: Streak;
};

/** Totals read in the same transaction as an append: just before it and after the refold. */
export type AppendedEvents = {
  readonly before: ProgressTotals;
  readonly after: ProgressTotals;
};

/**
 * Persistence of the learner's progress as an append-only event log (see `foldEvents`).
 * Reads come from a cache of the fold (review states, XP, streak, placement) that every write
 * refreshes, so they stay fast. Implemented by the app layer (e.g. SQLite).
 */
export interface ProgressRepository {
  /** All cached review states (sorted by itemId), or only those for `itemIds` when given. */
  getReviewStates(itemIds?: readonly string[]): Promise<readonly ReviewState[]>;
  /** The cached streak, or EMPTY_STREAK when none exists. */
  getStreak(): Promise<Streak>;
  getXp(): Promise<number>;
  getPlacementResult(): Promise<PlacementResult | null>;
  /** The cached best result of every lesson completed in the log (sorted by lessonId). */
  getLessonResults(): Promise<readonly LessonResult[]>;
  /** First dated lesson completion and latest eligible checkpoint result, not mastery. */
  getCheckpointEvidence(checkpointId: string, lessonId: string): Promise<CheckpointEvidence>;
  /** The cached answer history of every reviewed item (sorted by itemId). */
  getItemHistories(): Promise<readonly ItemHistory[]>;
  /**
   * The cached exercises answered per local date (the fold's `dailyExercises`, sorted by date;
   * one row per active day). `exercisesOn` reads one day from it.
   */
  getDailyExercises(): Promise<readonly DailyExercises[]>;
  /** Completed review exercises on one local date, including legacy completions conservatively. */
  getDailyReviewExercises(date: LocalDate): Promise<number>;

  /** Stable id of this install; every event it writes carries it as `deviceId`. */
  getDeviceId(): Promise<string>;

  /**
   * Appends locally written events and brings the cache up to the fold of the whole log, in ONE
   * transaction: all or nothing, so a failed append can be retried. Resolves to the totals just
   * before and after (the difference is what these events earned, as the fold decides it).
   */
  appendEvents(events: readonly ProgressEvent[]): Promise<AppendedEvents>;

  /** Recomputes the whole cache from the event log (e.g. after events arrived by sync). */
  rebuildFromEvents(): Promise<void>;
}

/** An event received from the sync server, with the sequence number the server gave it. */
export type RemoteEvent = StoredEvent & { readonly serverSeq?: number };

/** The event log as the sync engine sees it. Implemented next to `ProgressRepository`. */
export interface ProgressSyncStore {
  /** Events written on this device that the server has not acknowledged, oldest first. */
  getUnsyncedEvents(limit: number): Promise<readonly StoredEvent[]>;
  /**
   * Marks events as acknowledged; `serverSeqs[i]` is the server sequence of `ids[i]`, or null
   * when the server did not say.
   */
  markSynced(ids: readonly string[], serverSeqs: readonly (number | null)[]): Promise<void>;
  /** The last server sequence pulled (0 before the first pull). */
  getSyncCursor(): Promise<number>;
  setSyncCursor(cursor: number): Promise<void>;
  /**
   * Stores events pulled from the server, ignoring ids already stored (idempotent), then
   * rebuilds the cache, in one transaction. Resolves to the number of new events stored.
   */
  insertRemoteEvents(events: readonly RemoteEvent[]): Promise<number>;
}
