import { countUpValue } from "./count-up";

describe("countUpValue", () => {
  it("starts at zero and lands exactly on the target", () => {
    expect(countUpValue(75, 0, 600)).toBe(0);
    expect(countUpValue(75, 600, 600)).toBe(75);
    expect(countUpValue(75, 5000, 600)).toBe(75);
  });

  it("only ever counts up, in whole numbers, never past the target", () => {
    const values = Array.from({ length: 41 }, (_, i) => countUpValue(75, i * 15, 600));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]!);
      expect(Number.isInteger(values[i])).toBe(true);
      expect(values[i]).toBeLessThanOrEqual(75);
    }
  });

  it("eases out: most of the count happens early", () => {
    expect(countUpValue(100, 300, 600)).toBeGreaterThan(70);
  });

  it("shows the target at once for zero, negative or no duration", () => {
    expect(countUpValue(0, 0, 600)).toBe(0);
    expect(countUpValue(30, 0, 0)).toBe(30);
    expect(countUpValue(-5, 100, 600)).toBe(-5);
  });
});
