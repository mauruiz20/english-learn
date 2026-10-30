import { describe, expect, it } from "vitest";
import { localDate } from "../local-date";
import { initialState, type ReviewState } from "../srs";
import { levelProgress } from "./level-progress";

const today = localDate("2026-10-29");
const withInterval = (itemId: string, intervalDays: number): ReviewState => ({
  ...initialState(itemId, today),
  reps: 1,
  intervalDays,
});

describe("levelProgress", () => {
  const states = [
    withInterval("a", 1),
    withInterval("b", 21),
    withInterval("c", 40),
    withInterval("other-level", 100),
  ];

  it("counts seen and mastered items of the level only", () => {
    expect(levelProgress({ itemIds: ["a", "b", "c", "d"], states })).toEqual({
      total: 4,
      seen: 3,
      mastered: 2,
      ratio: 0.5,
    });
  });

  it("accepts a custom mastery interval", () => {
    expect(
      levelProgress({ itemIds: ["a", "b", "c", "d"], states, masteryIntervalDays: 30 }).mastered,
    ).toBe(1);
  });

  it("deduplicates item ids", () => {
    expect(levelProgress({ itemIds: ["b", "b"], states })).toEqual({
      total: 1,
      seen: 1,
      mastered: 1,
      ratio: 1,
    });
  });

  it("returns a zero ratio for an empty level", () => {
    expect(levelProgress({ itemIds: [], states })).toEqual({
      total: 0,
      seen: 0,
      mastered: 0,
      ratio: 0,
    });
  });
});
