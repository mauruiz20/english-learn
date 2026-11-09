import type { LocalDate } from "../local-date";
import type { CheckpointCompletedEvent, StoredEvent } from "../progress-log/events";
import { parseEvent, validEnvelope } from "../progress-log/validate";

export const CHECKPOINT_DELAY_MS = 24 * 60 * 60 * 1_000;

export type CheckpointResult = {
  readonly correct: number;
  readonly total: 3;
  readonly occurredAt: number;
  readonly localDate: LocalDate;
};

export type CheckpointEvidence = {
  readonly completedAt: number | null;
  readonly result: CheckpointResult | null;
};

/** A checkpoint is evidence about its own three answers, never a lesson or mastery verdict. */
export function checkpointEvidence(
  stored: readonly StoredEvent[],
  checkpointId: string,
  lessonId: string,
): CheckpointEvidence {
  const events = stored.flatMap((event) => {
    if (!validEnvelope(event)) return [];
    const parsed = parseEvent(event);
    return parsed.ok ? [parsed.event] : [];
  });
  let completedAt: number | null = null;
  for (const event of events) {
    if (
      event.type !== "session_completed" ||
      event.payload.kind !== "lesson" ||
      event.payload.lessonId !== lessonId
    )
      continue;
    if (completedAt === null || event.occurredAt < completedAt) completedAt = event.occurredAt;
  }
  if (completedAt === null) return { completedAt, result: null };
  let latest: CheckpointCompletedEvent | null = null;
  for (const event of events) {
    if (
      event.type !== "checkpoint_completed" ||
      event.payload.checkpointId !== checkpointId ||
      event.payload.lessonId !== lessonId ||
      event.occurredAt < completedAt + CHECKPOINT_DELAY_MS
    )
      continue;
    if (
      latest === null ||
      event.occurredAt > latest.occurredAt ||
      (event.occurredAt === latest.occurredAt && event.id > latest.id)
    )
      latest = event;
  }
  return {
    completedAt,
    result:
      latest === null
        ? null
        : {
            correct: latest.payload.correct,
            total: latest.payload.total,
            occurredAt: latest.occurredAt,
            localDate: latest.localDate,
          },
  };
}

export function checkpointAvailable(evidence: CheckpointEvidence, nowMs: number): boolean {
  return (
    evidence.completedAt !== null &&
    evidence.result === null &&
    nowMs >= evidence.completedAt + CHECKPOINT_DELAY_MS
  );
}
