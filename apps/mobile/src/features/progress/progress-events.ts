import {
  MAX_DISPUTED_ANSWER_LENGTH,
  uuidv7,
  type AnswerDisputedEvent,
  type BaselineImportedEvent,
  type EventId,
  type Grade,
  type ItemReviewedEvent,
  type Level,
  type LocalDate,
  type PlacementCompletedEvent,
  type SessionCompletedEvent,
} from "@english-learn/domain";

/** Cryptographically secure random bytes (`crypto.getRandomValues`); tests inject a fake. */
export type RandomBytes = (n: number) => Uint8Array;

/** Envelope shared by the events of one write: who, when, and the source of fresh ids. */
export type EventStamp = {
  readonly deviceId: string;
  /** Device wall clock, epoch ms (integer). */
  readonly occurredAt: number;
  /** The learner's calendar day of the write; one per save. */
  readonly localDate: LocalDate;
  readonly randomBytes: RandomBytes;
};

/** A fresh UUIDv7 for the stamp's time (event ids, session ids). */
export function newEventId(stamp: EventStamp): EventId {
  return uuidv7(stamp.occurredAt, stamp.randomBytes);
}

function envelope(stamp: EventStamp) {
  return {
    id: newEventId(stamp),
    deviceId: stamp.deviceId,
    occurredAt: stamp.occurredAt,
    localDate: stamp.localDate,
  };
}

export function itemReviewedEvent(
  stamp: EventStamp,
  sessionId: string,
  itemId: string,
  grade: Grade,
): ItemReviewedEvent {
  return {
    ...envelope(stamp),
    type: "item_reviewed",
    payload: { v: 1, sessionId, itemId, grade },
  };
}

export function sessionCompletedEvent(
  stamp: EventStamp,
  payload: Omit<SessionCompletedEvent["payload"], "v">,
): SessionCompletedEvent {
  const { lessonId, ...rest } = payload;
  return {
    ...envelope(stamp),
    type: "session_completed",
    // `lessonId` only on lessons, and never as an explicit `undefined`.
    payload: { v: 1, ...rest, ...(lessonId === undefined ? {} : { lessonId }) },
  };
}

export function placementCompletedEvent(
  stamp: EventStamp,
  level: Level,
  theta: number,
): PlacementCompletedEvent {
  return { ...envelope(stamp), type: "placement_completed", payload: { v: 1, level, theta } };
}

export function baselineImportedEvent(
  stamp: EventStamp,
  payload: Omit<BaselineImportedEvent["payload"], "v">,
): BaselineImportedEvent {
  return { ...envelope(stamp), type: "baseline_imported", payload: { v: 1, ...payload } };
}

/** A translate_write answer the learner marked as correct; `answer` is trimmed and capped. */
export function answerDisputedEvent(
  stamp: EventStamp,
  dispute: {
    readonly exerciseId: string;
    readonly itemIds: readonly string[];
    readonly answer: string;
  },
): AnswerDisputedEvent {
  return {
    ...envelope(stamp),
    type: "answer_disputed",
    payload: {
      v: 1,
      exerciseId: dispute.exerciseId,
      itemIds: [...dispute.itemIds],
      answer: dispute.answer.trim().slice(0, MAX_DISPUTED_ANSWER_LENGTH),
      accepted: false,
    },
  };
}
