import { createCorpus } from "@english-learn/content";
import { localDate, type StoredEvent } from "@english-learn/domain";
import { allExercises, lesson, passage } from "@/features/lesson/model/fixtures";
import { activityRange, previewTransfer } from "./transfer-preview";

const content = createCorpus([{ exercises: allExercises, passages: [passage], lessons: [lesson] }]);
const itemIds = [...new Set(allExercises.flatMap((e) => e.itemIds))];

function envelope(n: number, date: string): Omit<StoredEvent, "type" | "payload"> {
  return {
    id: `019a3456-7890-7abc-8def-${String(n).padStart(12, "0")}`,
    deviceId: "new-device",
    occurredAt: 1_000 + n,
    localDate: localDate(date),
  };
}

/** The lesson done on 30/10, after a first review on 28/10. */
function claimed(): StoredEvent[] {
  return [
    {
      ...envelope(0, "2026-10-28"),
      type: "item_reviewed",
      payload: { v: 1, sessionId: "s0", itemId: itemIds[0], grade: 3 },
    },
    ...itemIds.map((itemId, i) => ({
      ...envelope(i + 1, "2026-10-30"),
      type: "item_reviewed",
      payload: { v: 1, sessionId: "s1", itemId, grade: 5 },
    })),
    {
      ...envelope(itemIds.length + 1, "2026-10-30"),
      type: "session_completed",
      payload: {
        v: 1,
        sessionId: "s1",
        kind: "lesson",
        lessonId: lesson.id,
        answerXp: 60,
        accuracy: 1,
      },
    },
  ];
}

describe("previewTransfer", () => {
  it("folds the claimed events alone into what they would bring", () => {
    const events = claimed();

    expect(previewTransfer(events, { today: localDate("2026-10-30"), content })).toEqual({
      xp: 80,
      lessonsDone: 1,
      streakDays: 1,
      firstDate: "2026-10-28",
      lastDate: "2026-10-30",
      events: events.length,
    });
  });

  it("counts a streak that is no longer alive as zero", () => {
    expect(previewTransfer(claimed(), { today: localDate("2026-11-05"), content }).streakDays).toBe(
      0,
    );
  });

  it("previews an empty transfer as nothing", () => {
    expect(previewTransfer([], { today: localDate("2026-10-30"), content })).toEqual({
      xp: 0,
      lessonsDone: 0,
      streakDays: 0,
      firstDate: null,
      lastDate: null,
      events: 0,
    });
  });
});

describe("activityRange", () => {
  it("names the days the progress spans", () => {
    expect(activityRange({ firstDate: "2026-10-28", lastDate: "2026-10-30" })).toBe(
      "del 28/10/2026 al 30/10/2026",
    );
    expect(activityRange({ firstDate: "2026-10-30", lastDate: "2026-10-30" })).toBe(
      "el 30/10/2026",
    );
    expect(activityRange({ firstDate: null, lastDate: null })).toBeNull();
  });
});
