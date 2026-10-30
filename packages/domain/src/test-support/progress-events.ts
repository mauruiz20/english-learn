import type { LocalDate } from "../local-date";
import type {
  BaselineImportedEvent,
  ItemReviewedEvent,
  PlacementCompletedEvent,
  SessionCompletedEvent,
} from "../progress-log/events";
import type { Grade } from "../srs";

/** Envelope fields every test event needs; `id` must be unique per logical event. */
export type Meta = {
  readonly id: string;
  readonly localDate: LocalDate;
  readonly occurredAt?: number;
  readonly deviceId?: string;
};

function envelope(meta: Meta) {
  return {
    id: meta.id,
    deviceId: meta.deviceId ?? "device-a",
    occurredAt: meta.occurredAt ?? 0,
    localDate: meta.localDate,
  };
}

export function itemReviewed(
  meta: Meta,
  sessionId: string,
  itemId: string,
  grade: Grade,
): ItemReviewedEvent {
  return {
    ...envelope(meta),
    type: "item_reviewed",
    payload: { v: 1, sessionId, itemId, grade },
  };
}

export function lessonCompleted(
  meta: Meta,
  sessionId: string,
  lessonId: string,
  answerXp: number,
  accuracy: number,
): SessionCompletedEvent {
  return {
    ...envelope(meta),
    type: "session_completed",
    payload: { v: 1, sessionId, kind: "lesson", lessonId, answerXp, accuracy },
  };
}

export function reviewCompleted(
  meta: Meta,
  sessionId: string,
  answerXp: number,
  accuracy: number,
): SessionCompletedEvent {
  return {
    ...envelope(meta),
    type: "session_completed",
    payload: { v: 1, sessionId, kind: "review", answerXp, accuracy },
  };
}

export function placementCompleted(
  meta: Meta,
  level: PlacementCompletedEvent["payload"]["level"],
  theta: number,
): PlacementCompletedEvent {
  return { ...envelope(meta), type: "placement_completed", payload: { v: 1, level, theta } };
}

export function baselineImported(
  meta: Meta,
  payload: Omit<BaselineImportedEvent["payload"], "v">,
): BaselineImportedEvent {
  return { ...envelope(meta), type: "baseline_imported", payload: { v: 1, ...payload } };
}
