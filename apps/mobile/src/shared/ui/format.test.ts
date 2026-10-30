import { formatDays } from "./format";

describe("formatDays", () => {
  it.each([
    [0, "0 días"],
    [1, "1 día"],
    [2, "2 días"],
  ])("formats %i as %s", (days, text) => {
    expect(formatDays(days)).toBe(text);
  });
});
