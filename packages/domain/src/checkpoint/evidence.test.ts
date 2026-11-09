import { describe, expect, it } from "vitest";
import {
  CHECKPOINT_DELAY_MS,
  checkpointAvailable,
  checkpointEvidence,
  foldEvents,
  localDate,
  type StoredEvent,
} from "../index";

const HOUR = 3_600_000;
const LESSON = "a1.greetings.lesson-001";
const CHECKPOINT = "a1.introductions";
const START = Date.parse("2026-11-09T23:30:00Z");

function lesson(at = START): StoredEvent {
  return {
    id: `lesson-${at}`,
    deviceId: "device-a",
    occurredAt: at,
    localDate: "2026-11-09",
    type: "session_completed",
    payload: {
      v: 1,
      sessionId: `session-${at}`,
      kind: "lesson",
      lessonId: LESSON,
      answerXp: 10,
      accuracy: 1,
    },
  };
}

function result(at = START + 24 * HOUR, correct = 2): StoredEvent {
  return {
    id: `checkpoint-${at}`,
    deviceId: "device-b",
    occurredAt: at,
    localDate: "2026-11-10",
    type: "checkpoint_completed",
    payload: { v: 1, checkpointId: CHECKPOINT, lessonId: LESSON, correct, total: 3 },
  };
}

describe("delayed checkpoint evidence", () => {
  it("requires an actual lesson timestamp and exactly 24 elapsed hours, not a new date", () => {
    const missing = checkpointEvidence([], CHECKPOINT, LESSON);
    expect(missing).toEqual({ completedAt: null, result: null });
    expect(checkpointAvailable(missing, START + 48 * HOUR)).toBe(false);
    const evidence = checkpointEvidence([lesson()], CHECKPOINT, LESSON);
    expect(CHECKPOINT_DELAY_MS).toBe(24 * HOUR);
    expect(checkpointAvailable(evidence, START + HOUR)).toBe(false);
    expect(checkpointAvailable(evidence, START + 24 * HOUR - 1)).toBe(false);
    expect(checkpointAvailable(evidence, START + 24 * HOUR)).toBe(true);
  });

  it("keeps the first completion when a lesson is redone or its events arrive out of order", () => {
    const evidence = checkpointEvidence(
      [lesson(START + 12 * HOUR), lesson(), lesson()],
      CHECKPOINT,
      LESSON,
    );
    expect(evidence.completedAt).toBe(START);
    expect(checkpointAvailable(evidence, START + 24 * HOUR)).toBe(true);
  });

  it("keeps the latest valid score and date separately without changing ordinary progress", () => {
    const events = [lesson(), result(), result(START + 48 * HOUR, 0)];
    const evidence = checkpointEvidence(events, CHECKPOINT, LESSON);
    expect(evidence.result).toEqual({
      correct: 0,
      total: 3,
      occurredAt: START + 48 * HOUR,
      localDate: localDate("2026-11-10"),
    });
    expect(checkpointAvailable(evidence, START + 72 * HOUR)).toBe(false);
    expect(foldEvents(events)).toEqual(foldEvents([lesson()]));
    expect(checkpointEvidence([...events].reverse(), CHECKPOINT, LESSON)).toEqual(evidence);
  });

  it("ignores early, unrelated or invalid results rather than manufacturing evidence", () => {
    const invalid: StoredEvent[] = [
      result(START + HOUR),
      { ...result(), payload: { ...(result().payload as object), correct: 4 } },
      { ...result(), payload: { ...(result().payload as object), total: 4 } },
      { ...result(), payload: { ...(result().payload as object), checkpointId: "other" } },
      { ...result(), localDate: "not-a-date" },
    ];
    expect(checkpointEvidence([lesson(), ...invalid], CHECKPOINT, LESSON).result).toBeNull();
    expect(checkpointEvidence([result()], CHECKPOINT, LESSON)).toEqual({
      completedAt: null,
      result: null,
    });
    const baseline: StoredEvent = {
      ...lesson(),
      type: "baseline_imported",
      payload: {
        v: 1,
        states: [],
        xp: 0,
        streak: { current: 0, longest: 0, lastActiveDate: null },
        placement: null,
        completedLessonIds: [LESSON],
      },
    };
    expect(checkpointEvidence([baseline], CHECKPOINT, LESSON).completedAt).toBeNull();
  });
});
