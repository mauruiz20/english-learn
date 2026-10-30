import { describe, expect, it } from "vitest";
import { localDate } from "../local-date";
import type { Streak } from "./streak";
import { EMPTY_STREAK, isStreakAlive, recordActivity } from "./streak";

const d = localDate;

describe("recordActivity", () => {
  it.each<[string, Streak, string, Streak]>([
    [
      "first ever activity",
      EMPTY_STREAK,
      "2026-10-29",
      { current: 1, longest: 1, lastActiveDate: d("2026-10-29") },
    ],
    [
      "same day is unchanged",
      { current: 3, longest: 5, lastActiveDate: d("2026-10-29") },
      "2026-10-29",
      { current: 3, longest: 5, lastActiveDate: d("2026-10-29") },
    ],
    [
      "consecutive day extends",
      { current: 3, longest: 5, lastActiveDate: d("2026-10-28") },
      "2026-10-29",
      { current: 4, longest: 5, lastActiveDate: d("2026-10-29") },
    ],
    [
      "extending past longest updates longest",
      { current: 5, longest: 5, lastActiveDate: d("2026-12-31") },
      "2027-01-01",
      { current: 6, longest: 6, lastActiveDate: d("2027-01-01") },
    ],
    [
      "a gap of 2+ days resets to 1",
      { current: 7, longest: 7, lastActiveDate: d("2026-10-27") },
      "2026-10-29",
      { current: 1, longest: 7, lastActiveDate: d("2026-10-29") },
    ],
    [
      "clock skew (today before last active) is unchanged",
      { current: 3, longest: 5, lastActiveDate: d("2026-10-29") },
      "2026-10-28",
      { current: 3, longest: 5, lastActiveDate: d("2026-10-29") },
    ],
  ])("%s", (_label, streak, today, expected) => {
    expect(recordActivity(streak, d(today))).toEqual(expected);
  });
});

describe("isStreakAlive", () => {
  const streak: Streak = { current: 3, longest: 3, lastActiveDate: d("2026-10-28") };

  it.each([
    ["2026-10-28", true],
    ["2026-10-29", true],
    ["2026-10-30", false],
    ["2026-10-27", true],
  ])("on %s -> %s", (today, alive) => {
    expect(isStreakAlive(streak, d(today))).toBe(alive);
  });

  it("is false when there has never been activity", () => {
    expect(isStreakAlive(EMPTY_STREAK, d("2026-10-29"))).toBe(false);
  });
});
