import { describe, expect, it } from "vitest";
import type { PlacementAnswer, PlacementCandidate } from "./model";
import { estimateAbility, isBankExhausted, nextQuestion, shouldStop } from "./cat";

const item = (id: string, difficulty: number, optionCount = 4): PlacementCandidate => ({
  id,
  level: "B1",
  optionCount,
  difficulty,
});

const bank = [item("e", -2), item("m", 0), item("h", 2)];

describe("estimateAbility (EAP, N(0,1) prior)", () => {
  it("returns the prior mean and ~unit SD without answers", () => {
    const { theta, se } = estimateAbility({ candidates: bank, answers: [] });
    expect(theta).toBeCloseTo(0, 6);
    expect(se).toBeCloseTo(1, 2);
  });

  it("moves up after a correct answer and down after a wrong one", () => {
    const up = estimateAbility({ candidates: bank, answers: [{ id: "m", correct: true }] });
    const down = estimateAbility({ candidates: bank, answers: [{ id: "m", correct: false }] });
    expect(up.theta).toBeGreaterThan(0);
    expect(down.theta).toBeLessThan(0);
  });

  it("keeps moving in the direction of consecutive answers and shrinks SE on informative items", () => {
    const near = [item("m", 0), item("b", 1)];
    const one = estimateAbility({ candidates: near, answers: [{ id: "m", correct: true }] });
    const two = estimateAbility({
      candidates: near,
      answers: [
        { id: "m", correct: true },
        { id: "b", correct: true },
      ],
    });
    expect(two.theta).toBeGreaterThan(one.theta);
    expect(two.se).toBeLessThan(one.se);
  });

  it("stays finite with many extreme answers (log-space)", () => {
    const many = Array.from({ length: 400 }, (_, i) => item(`x${i}`, 4));
    const answers = many.map((c) => ({ id: c.id, correct: true }));
    const { theta, se } = estimateAbility({ candidates: many, answers });
    expect(Number.isFinite(theta)).toBe(true);
    expect(Number.isFinite(se)).toBe(true);
    expect(theta).toBeLessThanOrEqual(4);
  });

  it("rejects answers to unknown items", () => {
    expect(() =>
      estimateAbility({ candidates: bank, answers: [{ id: "zz", correct: true }] }),
    ).toThrow(/unknown/i);
  });
});

describe("nextQuestion", () => {
  const rng = () => 0;

  it("picks the most informative unused item at the current estimate", () => {
    expect(nextQuestion({ candidates: bank, answers: [], rng })?.id).toBe("m");
  });

  // A spread bank from −2 to 2 in 0.5 steps.
  const spread = Array.from({ length: 9 }, (_, i) => item(`s${i}`, -2 + i * 0.5));
  const difficultyAfter = (streak: number, correct: boolean) => {
    const answers: PlacementAnswer[] = [];
    for (let i = 0; i < streak; i++) {
      const next = nextQuestion({ candidates: spread, answers, rng });
      if (next) answers.push({ id: next.id, correct });
    }
    return nextQuestion({ candidates: spread, answers, rng })?.difficulty ?? Number.NaN;
  };

  it("moves to harder items after a run of correct answers", () => {
    expect(difficultyAfter(3, true)).toBeGreaterThan(0);
  });

  it("moves to easier items after a run of wrong answers", () => {
    expect(difficultyAfter(3, false)).toBeLessThan(0);
  });

  it("breaks near-ties with the injected rng", () => {
    const twins = [item("t1", 0), item("t2", 0), item("t3", 0)];
    expect(nextQuestion({ candidates: twins, answers: [], rng: () => 0 })?.id).toBe("t1");
    expect(nextQuestion({ candidates: twins, answers: [], rng: () => 0.5 })?.id).toBe("t2");
    expect(nextQuestion({ candidates: twins, answers: [], rng: () => 0.99 })?.id).toBe("t3");
  });

  it("returns null when every candidate was used", () => {
    const answers = bank.map((c) => ({ id: c.id, correct: true }));
    expect(nextQuestion({ candidates: bank, answers, rng })).toBeNull();
  });
});

describe("shouldStop", () => {
  const answers = (n: number): PlacementAnswer[] =>
    Array.from({ length: n }, (_, i) => ({ id: `q${i}`, correct: true }));

  it.each([
    [10, 0.1, false, "below the minimum even if precise"],
    [15, 0.5, false, "at the minimum but not precise enough"],
    [15, 0.39, true, "at the minimum and precise"],
    [19, 0.6, false, "below the maximum and imprecise"],
    [20, 0.9, true, "at the maximum"],
  ])("%i answers, se %f -> %s (%s)", (n, se, expected) => {
    expect(shouldStop({ answers: answers(n), se })).toBe(expected);
  });

  it("accepts custom limits", () => {
    expect(shouldStop({ answers: answers(5), se: 0.2, minQuestions: 5, targetSe: 0.3 })).toBe(true);
    expect(shouldStop({ answers: answers(8), se: 0.9, maxQuestions: 8 })).toBe(true);
  });
});

describe("isBankExhausted", () => {
  it("is true only when every candidate has been answered", () => {
    expect(isBankExhausted({ candidates: bank, answers: [{ id: "m", correct: true }] })).toBe(
      false,
    );
    const all = bank.map((c) => ({ id: c.id, correct: false }));
    expect(isBankExhausted({ candidates: bank, answers: all })).toBe(true);
  });
});
