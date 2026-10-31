import { XP_PER_SHEET, xpSheet } from "./xp-sheet";

describe("xpSheet", () => {
  it("starts on sheet 1 with nothing filled", () => {
    expect(xpSheet(0)).toEqual({ sheet: 1, filled: 0, remaining: XP_PER_SHEET, fraction: 0 });
  });

  it("fills the current sheet with the XP earned since the last full one", () => {
    expect(xpSheet(1090)).toEqual({ sheet: 5, filled: 90, remaining: 160, fraction: 90 / 250 });
  });

  it("turns to a new, empty sheet exactly when one is full", () => {
    expect(xpSheet(XP_PER_SHEET)).toEqual({
      sheet: 2,
      filled: 0,
      remaining: XP_PER_SHEET,
      fraction: 0,
    });
  });

  it.each([[-10], [Number.NaN], [12.7]])("treats odd XP (%p) safely", (xp) => {
    const sheet = xpSheet(xp);
    expect(sheet.sheet).toBeGreaterThanOrEqual(1);
    expect(sheet.fraction).toBeGreaterThanOrEqual(0);
    expect(sheet.fraction).toBeLessThan(1);
    expect(Number.isInteger(sheet.filled)).toBe(true);
  });
});
