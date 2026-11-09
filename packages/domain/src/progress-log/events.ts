import type { Level } from "../cefr";
import type { LocalDate } from "../local-date";
import type { PlacementResult } from "../ports";
import type { Grade, ReviewState } from "../srs";
import type { Streak } from "../streak";
import type { EventId } from "./uuidv7";

/** Payload schema version understood by this fold. Other versions are skipped as anomalies. */
export const EVENT_PAYLOAD_VERSION = 1;

/** Common envelope of every progress event. Events are immutable once written. */
export type EventEnvelope<TType extends string, TPayload> = {
  readonly id: EventId;
  /** Device that wrote the event (opaque, stable per install). */
  readonly deviceId: string;
  /** Device wall clock, epoch ms. Orders events within the same `localDate`. */
  readonly occurredAt: number;
  /** Device calendar date when the event happened; the primary ordering key. */
  readonly localDate: LocalDate;
  readonly type: TType;
  readonly payload: TPayload;
};

/**
 * One item's FINAL grade for one session. Worst grade wins and the looked-up cap are applied by
 * the app before emitting; exactly one event per item per session.
 */
export type ItemReviewedEvent = EventEnvelope<
  "item_reviewed",
  {
    readonly v: 1;
    readonly sessionId: string;
    readonly itemId: string;
    readonly grade: Grade;
  }
>;

/**
 * A finished lesson or review session. `answerXp` is the sum of per-answer XP; the lesson
 * first-time completion bonus is decided by the fold, never by the device.
 */
export type SessionCompletedEvent = EventEnvelope<
  "session_completed",
  {
    readonly v: 1;
    readonly sessionId: string;
    readonly kind: "lesson" | "review";
    /** Required when `kind` is "lesson". */
    readonly lessonId?: string;
    readonly answerXp: number;
    /** Share of fully correct answers, 0..1. */
    readonly accuracy: number;
    /**
     * Exercises answered in the session (the daily goal counts them per `localDate`). Absent in
     * events written before the daily goal existed: they count no exercises.
     */
    readonly exercises?: number;
  }
>;

export type PlacementCompletedEvent = EventEnvelope<
  "placement_completed",
  { readonly v: 1; readonly level: Level; readonly theta: number }
>;

/**
 * Snapshot of the progress a device had before it started writing events (written once per
 * device at migration). Several baselines (one per device) merge; see `foldEvents`.
 */
export type BaselineImportedEvent = EventEnvelope<
  "baseline_imported",
  {
    readonly v: 1;
    readonly states: readonly ReviewState[];
    readonly xp: number;
    readonly streak: Streak;
    readonly placement: PlacementResult | null;
    /**
     * Lessons that must not earn the first-time bonus again (pre-event storage has no lesson
     * log, so the app derives them: lessons whose items all have a review state). Optional.
     */
    readonly completedLessonIds?: readonly string[];
  }
>;

/**
 * The learner said their translate_write answer is also correct ("Mi respuesta también es
 * correcta") and the app regraded it for that attempt (already reflected in the session's
 * `item_reviewed` grades and XP). Kept so the owner can review content; it changes no progress.
 * `answer` is trimmed and at most `MAX_DISPUTED_ANSWER_LENGTH` characters; `accepted` is always
 * false (the content was not changed).
 */
export type AnswerDisputedEvent = EventEnvelope<
  "answer_disputed",
  {
    readonly v: 1;
    readonly exerciseId: string;
    readonly itemIds: readonly string[];
    readonly answer: string;
    readonly accepted: false;
  }
>;

export const MAX_DISPUTED_ANSWER_LENGTH = 200;

/** A three-question delayed check, separate from ordinary lesson/review progress. */
export type CheckpointCompletedEvent = EventEnvelope<
  "checkpoint_completed",
  {
    readonly v: 1;
    readonly checkpointId: string;
    readonly lessonId: string;
    readonly correct: number;
    readonly total: 3;
  }
>;

/**
 * Event types an older app wrote and this one no longer reads (Avi's wardrobe and its plumas,
 * withdrawn: `docs/design/avi-rewards.md`). Logs and the sync server may still hold them, so the
 * fold accepts them whatever their payload and ignores them: no progress, no anomaly.
 */
export const RETIRED_EVENT_TYPES: readonly string[] = ["item_purchased", "item_equipped"];

export type ProgressEvent =
  | ItemReviewedEvent
  | SessionCompletedEvent
  | PlacementCompletedEvent
  | BaselineImportedEvent
  | CheckpointCompletedEvent
  | AnswerDisputedEvent;

export type ProgressEventType = ProgressEvent["type"];

/**
 * An event as read back from storage or another device: possibly written by a newer app version
 * (unknown `type` or payload `v`) or corrupted. `foldEvents` accepts these and never throws.
 */
export type StoredEvent = {
  readonly id: string;
  readonly deviceId: string;
  readonly occurredAt: number;
  readonly localDate: string;
  readonly type: string;
  readonly payload: unknown;
};
