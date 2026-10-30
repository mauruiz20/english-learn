import { describe, expect, it } from "vitest";
import { accuracy, xpForAnswer, xpForLessonCompletion } from "./xp";

describe("xpForAnswer", () => {
  it.each([
    ["correct", 10],
    ["almost", 5],
    ["wrong", 0],
  ] as const)("%s -> %i XP", (verdict, xp) => {
    expect(xpForAnswer(verdict)).toBe(xp);
  });
});

describe("xpForLessonCompletion", () => {
  it.each([
    [1, 20],
    [0.8, 20],
    [0.79, 10],
    [0, 10],
  ])("accuracy %f -> %i bonus XP", (value, xp) => {
    expect(xpForLessonCompletion(value)).toBe(xp);
  });

  it.each([-0.1, 1.1, Number.NaN])("rejects accuracy %f", (value) => {
    expect(() => xpForLessonCompletion(value)).toThrow(RangeError);
  });
});

describe("accuracy", () => {
  it.each([
    [["correct", "correct", "wrong", "almost"], 0.5],
    [["correct"], 1],
    [["wrong", "almost"], 0],
    [[], 0],
  ] as const)("%j -> %f (only 'correct' counts)", (verdicts, expected) => {
    expect(accuracy(verdicts)).toBe(expected);
  });
});
