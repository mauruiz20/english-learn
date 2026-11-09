import { describe, expect, it } from "vitest";
import { localDate } from "./local-date";
import type { StoredEvent } from "./progress-log/events";
import type { LocalDate } from "./local-date";
import { countDailyReviewExercises } from "./index";

const today = localDate("2026-11-09");

function completed(
  id: string,
  sessionId: string,
  localDate: LocalDate = today,
  kind: "lesson" | "review" = "review",
  exercises?: number,
): StoredEvent {
  return {
    id,
    deviceId: "device",
    occurredAt: Number(id),
    localDate,
    type: "session_completed",
    payload: {
      v: 1,
      sessionId,
      kind,
      answerXp: 0,
      accuracy: 1,
      ...(exercises === undefined ? {} : { exercises }),
    },
  };
}

describe("countDailyReviewExercises", () => {
  it("counts only completed review exercises for the requested local date", () => {
    expect(
      countDailyReviewExercises(
        [
          completed("1", "lesson", today, "lesson", 12),
          completed("2", "review-today", today, "review", 7),
          completed("3", "review-yesterday", localDate("2026-11-08"), "review", 9),
        ],
        today,
        20,
      ),
    ).toBe(7);
  });

  it("deduplicates by session id in fold order and treats legacy review counts as the full limit", () => {
    expect(
      countDailyReviewExercises(
        [
          completed("2", "duplicate", today, "review", 4),
          completed("1", "duplicate", today, "review", 8),
          completed("3", "legacy", today),
        ],
        today,
        20,
      ),
    ).toBe(28);
  });

  it("ignores malformed events without making a later valid completion look duplicated", () => {
    const malformed = completed("1", "same", today, "review", -1);
    expect(
      countDailyReviewExercises([malformed, completed("2", "same", today, "review", 3)], today, 20),
    ).toBe(3);
  });
});
