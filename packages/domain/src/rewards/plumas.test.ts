import { describe, expect, it } from "vitest";
import { EMPTY_REWARDS, NO_PLUMAS, plumasEarned, plumasTotals, type PlumasTotals } from "./plumas";

const totals = (overrides: Partial<PlumasTotals>): PlumasTotals => ({
  ...plumasTotals(EMPTY_REWARDS),
  ...overrides,
});

describe("plumasEarned", () => {
  it("is after − before, per source that paid, in the sources' order", () => {
    const before = totals({
      earned: 20,
      earnedBySource: { ...NO_PLUMAS, study_day: 10, new_lesson: 10 },
    });
    const after = totals({
      earned: 37,
      earnedBySource: { ...NO_PLUMAS, study_day: 15, new_lesson: 15, on_time_review: 7 },
    });
    expect(plumasEarned(before, after)).toEqual({
      total: 17,
      bySource: [
        { source: "study_day", plumas: 5 },
        { source: "new_lesson", plumas: 5 },
        { source: "on_time_review", plumas: 7 },
      ],
      capped: false,
    });
  });

  it("says when the daily cap held plumas back", () => {
    expect(plumasEarned(totals({ overCap: 5 }), totals({ overCap: 15 })).capped).toBe(true);
    expect(plumasEarned(totals({}), totals({})).total).toBe(0);
  });
});
