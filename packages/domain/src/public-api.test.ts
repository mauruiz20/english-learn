import { describe, expect, it } from "vitest";
import {
  LEVELS,
  addDays,
  gradeFromOutcome,
  initialState,
  isStreakAlive,
  levelProgress,
  localDate,
  matchAnswer,
  recordActivity,
  review,
  selectSession,
  xpForAnswer,
  EMPTY_STREAK,
  type Clock,
} from "./index";

const fixedClock = (iso: string, nowMs = 0): Clock => ({
  today: () => localDate(iso),
  nowMs: () => nowMs,
});

describe("public API (barrel)", () => {
  it("drives a review cycle end to end with an injected clock", () => {
    const clock = fixedClock("2026-10-29");
    const today = clock.today();

    const plan = selectSession({
      states: [],
      today,
      newItemIds: ["v1"],
      maxReviews: 10,
      maxNew: 5,
    });
    expect(plan.fresh).toEqual(["v1"]);

    const { verdict } = matchAnswer("I don't know", ["I do not know"]);
    const grade = gradeFromOutcome({ verdict, responseMs: 2000, expectedMs: 5000 });
    const state = review(initialState("v1", today), grade, today);

    expect(xpForAnswer(verdict)).toBe(10);
    expect(state.dueDate).toBe(addDays(today, 1));
    expect(levelProgress({ itemIds: ["v1"], states: [state] }).seen).toBe(1);

    const streak = recordActivity(EMPTY_STREAK, today);
    expect(isStreakAlive(streak, addDays(today, 1))).toBe(true);
  });

  it("exposes the CEFR levels in ascending order", () => {
    expect(LEVELS).toEqual(["A1", "A2", "B1", "B2", "C1"]);
  });
});
