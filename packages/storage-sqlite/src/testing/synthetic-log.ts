import { addDays, localDate, type Grade, type ProgressEvent } from "@english-learn/domain";

const START = localDate("2025-01-01");
const ITEMS_PER_SESSION = 12;
const ITEM_POOL = 2_000;
const LESSONS = 300;
const SESSIONS_PER_DAY = 8;

/**
 * A deterministic, realistic progress log of about `count` events: daily lessons and reviews of
 * 12 items each (one `item_reviewed` per item, then `session_completed`), as one device writes it.
 * Ids are zero-padded counters, so they sort like UUIDv7 ids of increasing time.
 */
export function syntheticLog(count: number, prefix = "e"): ProgressEvent[] {
  const events: ProgressEvent[] = [];
  for (let session = 0; events.length < count; session++) {
    events.push(...syntheticSession(session, prefix));
  }
  return events.slice(0, count);
}

/** Session number `session` of the synthetic log: 12 reviews and its completion, same day. */
export function syntheticSession(session: number, prefix = "e"): ProgressEvent[] {
  const day = addDays(START, Math.floor(session / SESSIONS_PER_DAY));
  const sessionId = `${prefix}-s${session}`;
  const occurredAt = Date.UTC(2025, 0, 1) + session * 600_000;
  let n = session * (ITEMS_PER_SESSION + 1);
  const meta = () => ({
    id: `${prefix}-${String(n++).padStart(9, "0")}`,
    deviceId: `${prefix}-device`,
    occurredAt,
    localDate: day,
  });
  const events: ProgressEvent[] = [];
  for (let i = 0; i < ITEMS_PER_SESSION; i++) {
    const itemId = `item-${(session * 7 + i * 13) % ITEM_POOL}`;
    const grade = ((session + i) % 6) as Grade;
    events.push({ ...meta(), type: "item_reviewed", payload: { v: 1, sessionId, itemId, grade } });
  }
  events.push({
    ...meta(),
    type: "session_completed",
    payload:
      session % 3 === 0
        ? { v: 1, sessionId, kind: "review", answerXp: 40, accuracy: 0.8 }
        : {
            v: 1,
            sessionId,
            kind: "lesson",
            lessonId: `lesson-${session % LESSONS}`,
            answerXp: 60,
            accuracy: ((session % 10) + 1) / 10,
          },
  });
  return events;
}
