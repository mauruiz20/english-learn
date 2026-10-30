import { describe, expect, it } from "vitest";
import { addDays, compareLocalDate, diffDays, isValidLocalDate, localDate } from "./local-date";

describe("isValidLocalDate", () => {
  it.each([
    ["2026-01-01", true],
    ["2024-02-29", true],
    ["2000-02-29", true],
    ["2026-12-31", true],
    ["2026-02-29", false],
    ["1900-02-29", false],
    ["2026-13-01", false],
    ["2026-00-10", false],
    ["2026-04-31", false],
    ["2026-1-01", false],
    ["26-01-01", false],
    ["2026-01-01T00:00", false],
    ["", false],
  ])("%s -> %s", (value, expected) => {
    expect(isValidLocalDate(value)).toBe(expected);
  });
});

describe("localDate", () => {
  it("brands a valid date", () => {
    expect(localDate("2026-10-29")).toBe("2026-10-29");
  });

  it("throws on an invalid date", () => {
    expect(() => localDate("2026-02-30")).toThrow(/invalid local date/i);
  });
});

describe("addDays", () => {
  it.each([
    ["2026-10-29", 1, "2026-10-30"],
    ["2026-10-31", 1, "2026-11-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2024-02-28", 1, "2024-02-29"],
    ["2026-02-28", 1, "2026-03-01"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2026-01-01", 0, "2026-01-01"],
    ["2026-01-01", 365, "2027-01-01"],
    ["2026-03-29", 1, "2026-03-30"],
    ["1970-01-01", -1, "1969-12-31"],
    ["0099-12-31", 1, "0100-01-01"],
    ["2026-01-31", 10_000, "2053-06-18"],
  ])("%s + %i = %s", (start, days, expected) => {
    expect(addDays(localDate(start), days)).toBe(expected);
  });
});

describe("diffDays", () => {
  it.each([
    ["2026-10-29", "2026-10-29", 0],
    ["2026-10-29", "2026-10-30", 1],
    ["2026-10-30", "2026-10-29", -1],
    ["2024-01-01", "2025-01-01", 366],
    ["2026-03-28", "2026-03-30", 2],
  ])("from %s to %s = %i", (from, to, expected) => {
    expect(diffDays(localDate(from), localDate(to))).toBe(expected);
  });
});

describe("compareLocalDate", () => {
  it("orders dates chronologically", () => {
    expect(compareLocalDate(localDate("2026-01-01"), localDate("2026-01-02"))).toBeLessThan(0);
    expect(compareLocalDate(localDate("2026-01-02"), localDate("2026-01-01"))).toBeGreaterThan(0);
    expect(compareLocalDate(localDate("2026-01-01"), localDate("2026-01-01"))).toBe(0);
  });
});
