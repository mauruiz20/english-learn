import { foldEvents, localDate } from "@english-learn/domain";
import { createTestRandomBytes } from "@/testing/random-bytes";
import {
  baselineImportedEvent,
  itemReviewedEvent,
  newEventId,
  placementCompletedEvent,
  sessionCompletedEvent,
  type EventStamp,
} from "./progress-events";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("progress events", () => {
  const stamp: EventStamp = {
    deviceId: "device-a",
    occurredAt: Date.UTC(2026, 9, 29, 12),
    localDate: localDate("2026-10-29"),
    randomBytes: createTestRandomBytes(),
  };

  it("stamps each event with a fresh UUIDv7 from the stamp's time and random bytes", () => {
    const a = itemReviewedEvent(stamp, "session-1", "item-a", 5);
    const b = itemReviewedEvent(stamp, "session-1", "item-b", 2);

    expect(a).toEqual({
      id: expect.stringMatching(UUID_V7),
      deviceId: "device-a",
      occurredAt: stamp.occurredAt,
      localDate: "2026-10-29",
      type: "item_reviewed",
      payload: { v: 1, sessionId: "session-1", itemId: "item-a", grade: 5 },
    });
    expect(b.id).not.toBe(a.id);
    // The UUIDv7 timestamp is the event time.
    expect(parseInt(a.id.replace(/-/g, "").slice(0, 12), 16)).toBe(stamp.occurredAt);
    expect(newEventId(stamp)).toMatch(UUID_V7);
  });

  it("builds events the fold accepts", () => {
    const events = [
      itemReviewedEvent(stamp, "s1", "a", 4),
      sessionCompletedEvent(stamp, {
        sessionId: "s1",
        kind: "lesson",
        lessonId: "l1",
        answerXp: 10,
        accuracy: 1,
      }),
      sessionCompletedEvent(stamp, { sessionId: "s2", kind: "review", answerXp: 5, accuracy: 0.5 }),
      placementCompletedEvent(stamp, "B1", 0.4),
      baselineImportedEvent(stamp, {
        states: [],
        xp: 3,
        streak: { current: 0, longest: 0, lastActiveDate: null },
        placement: null,
        completedLessonIds: ["l0"],
      }),
    ];

    const progress = foldEvents(events);

    expect(progress.anomalies).toEqual([]);
    expect(progress.xp).toBe(3 + 10 + 20 + 5);
    expect(progress.placement).toEqual({ level: "B1", theta: 0.4 });
    expect(progress.completedLessonIds).toEqual(["l0", "l1"]);
    expect(events[2]?.payload).not.toHaveProperty("lessonId");
  });
});
