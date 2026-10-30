import { describe, expect, it } from "vitest";
import {
  difficultyOf,
  fisherInformation,
  guessingOf,
  levelFromTheta,
  probabilityCorrect,
} from "./model";

describe("difficultyOf", () => {
  it.each([
    ["A1", -2],
    ["A2", -1],
    ["B1", 0],
    ["B2", 1],
    ["C1", 2],
  ] as const)("defaults %s to %i", (level, b) => {
    expect(difficultyOf({ id: "q", level, optionCount: 4 })).toBe(b);
  });

  it("prefers an explicit difficulty", () => {
    expect(difficultyOf({ id: "q", level: "A1", optionCount: 4, difficulty: 0.7 })).toBe(0.7);
  });
});

describe("guessingOf", () => {
  it("is 1 / optionCount", () => {
    expect(guessingOf({ id: "q", level: "B1", optionCount: 4 })).toBe(0.25);
  });

  it.each([0, 1, 2.5])("rejects optionCount %f", (optionCount) => {
    expect(() => guessingOf({ id: "q", level: "B1", optionCount })).toThrow(RangeError);
  });
});

describe("probabilityCorrect", () => {
  it("is halfway between guessing and 1 when theta equals difficulty", () => {
    expect(probabilityCorrect(0.5, 0.5, 0.25)).toBeCloseTo(0.625, 12);
  });

  it("approaches the guessing floor for very low ability and 1 for very high ability", () => {
    expect(probabilityCorrect(-20, 0, 0.25)).toBeCloseTo(0.25, 6);
    expect(probabilityCorrect(20, 0, 0.25)).toBeCloseTo(1, 6);
  });

  it("increases with ability", () => {
    expect(probabilityCorrect(1, 0, 0.25)).toBeGreaterThan(probabilityCorrect(0, 0, 0.25));
  });
});

describe("fisherInformation", () => {
  it("equals 0.25 at theta = b with no guessing (Rasch)", () => {
    expect(fisherInformation(0, 0, 0)).toBeCloseTo(0.25, 12);
  });

  it("is reduced by guessing and peaks slightly above the difficulty", () => {
    expect(fisherInformation(0, 0, 0.25)).toBeLessThan(fisherInformation(0, 0, 0));
    expect(fisherInformation(0.3, 0, 0.25)).toBeGreaterThan(fisherInformation(-0.3, 0, 0.25));
  });

  it("vanishes far from the difficulty", () => {
    expect(fisherInformation(-8, 0, 0.25)).toBeLessThan(1e-3);
    expect(fisherInformation(8, 0, 0.25)).toBeLessThan(1e-3);
  });
});

describe("levelFromTheta", () => {
  it.each([
    [-3, "A1"],
    [-1.51, "A1"],
    [-1.5, "A2"],
    [-0.51, "A2"],
    [-0.5, "B1"],
    [0, "B1"],
    [0.49, "B1"],
    [0.5, "B2"],
    [1.49, "B2"],
    [1.5, "C1"],
    [3, "C1"],
  ] as const)("theta %f -> %s", (theta, level) => {
    expect(levelFromTheta(theta)).toBe(level);
  });
});
