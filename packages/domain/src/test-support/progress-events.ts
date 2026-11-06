import type { LocalDate } from "../local-date";
import type {
  AnswerDisputedEvent,
  BaselineImportedEvent,
  ItemReviewedEvent,
  PlacementCompletedEvent,
  SessionCompletedEvent,
  StoredEvent,
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
  exercises?: number,
): SessionCompletedEvent {
  return {
    ...envelope(meta),
    type: "session_completed",
    payload: {
      v: 1,
      sessionId,
      kind: "lesson",
      lessonId,
      answerXp,
      accuracy,
      ...(exercises === undefined ? {} : { exercises }),
    },
  };
}

export function reviewCompleted(
  meta: Meta,
  sessionId: string,
  answerXp: number,
  accuracy: number,
  exercises?: number,
): SessionCompletedEvent {
  return {
    ...envelope(meta),
    type: "session_completed",
    payload: {
      v: 1,
      sessionId,
      kind: "review",
      answerXp,
      accuracy,
      ...(exercises === undefined ? {} : { exercises }),
    },
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

export function answerDisputed(
  meta: Meta,
  exerciseId: string,
  itemIds: readonly string[],
  overrides: Partial<Pick<AnswerDisputedEvent["payload"], "answer">> & Record<string, unknown> = {},
): AnswerDisputedEvent {
  return {
    ...envelope(meta),
    type: "answer_disputed",
    payload: { v: 1, exerciseId, itemIds, answer: "my answer", accepted: false, ...overrides },
  } as AnswerDisputedEvent;
}

/**
 * An event of a retired type (`RETIRED_EVENT_TYPES`), as an older app wrote it: a purchase or an
 * equip of Avi's withdrawn wardrobe. The fold must ignore it.
 */
export function retiredWardrobeEvent(
  meta: Meta,
  type: "item_purchased" | "item_equipped",
  payload: unknown,
): StoredEvent {
  return { ...envelope(meta), type, payload };
}
