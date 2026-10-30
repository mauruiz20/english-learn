import { describe, expect, it } from "vitest";
import { LEVELS, type Level } from "../cefr";
import type { Rng } from "../shuffle";
import { seededRng } from "../test-support/prng";
import { DEFAULT_DIFFICULTY, probabilityCorrect, type PlacementCandidate } from "./model";
import {
  answer,
  createPlacementSession,
  currentQuestion,
  result,
  type PlacementSession,
} from "./session";

/** 12 items per level; difficulties jittered ±0.275 around the level prior. */
const syntheticBank: PlacementCandidate[] = LEVELS.flatMap((level) =>
  Array.from({ length: 12 }, (_, i) => ({
    id: `${level}-${i}`,
    level,
    optionCount: 4,
    difficulty: DEFAULT_DIFFICULTY[level] + (i - 5.5) * 0.05,
  })),
);

type Responder = (question: PlacementCandidate) => boolean;

function run(responder: Responder, rng: Rng, candidates = syntheticBank): PlacementSession {
  let session = createPlacementSession({ candidates, rng });
  for (let guard = 0; guard < 1000; guard++) {
    const question = currentQuestion(session);
    if (!question) return session;
    session = answer(session, question.id, responder(question), rng);
  }
  throw new Error("placement did not terminate");
}

/** Simulated examinee answering per the 3PL model with a separate seeded rng. */
function examinee(trueTheta: number, rng: Rng): Responder {
  return (q) =>
    rng() <
    probabilityCorrect(trueTheta, q.difficulty ?? DEFAULT_DIFFICULTY[q.level], 1 / q.optionCount);
}

describe("placement session", () => {
  it("starts with a question and no answers", () => {
    const session = createPlacementSession({ candidates: syntheticBank, rng: seededRng(1) });
    expect(currentQuestion(session)).not.toBeNull();
    expect(session.answers).toEqual([]);
    expect(result(session)).toMatchObject({ done: false, answered: 0, level: "B1" });
  });

  it("is immutable: answering returns a new session and leaves the old one intact", () => {
    const rng = seededRng(1);
    const first = createPlacementSession({ candidates: syntheticBank, rng });
    const question = currentQuestion(first);
    if (!question) throw new Error("expected a question");
    const second = answer(first, question.id, true, rng);
    expect(second).not.toBe(first);
    expect(first.answers).toEqual([]);
    expect(second.answers).toEqual([{ id: question.id, correct: true }]);
  });

  it("raises the estimate after a correct answer and lowers it after a wrong one", () => {
    const rng = seededRng(1);
    const start = createPlacementSession({ candidates: syntheticBank, rng });
    const id = currentQuestion(start)?.id ?? "";
    expect(result(answer(start, id, true, rng)).theta).toBeGreaterThan(result(start).theta);
    expect(result(answer(start, id, false, rng)).theta).toBeLessThan(result(start).theta);
  });

  it("rejects answers to anything but the current question", () => {
    const rng = seededRng(1);
    const session = createPlacementSession({ candidates: syntheticBank, rng });
    const other = syntheticBank.find((c) => c.id !== currentQuestion(session)?.id)?.id ?? "";
    expect(() => answer(session, other, true, rng)).toThrow(/current question/i);
  });

  it("rejects answers once finished", () => {
    const rng = seededRng(1);
    const done = run(() => true, rng);
    expect(() => answer(done, "A1-0", true, rng)).toThrow(/finished/i);
  });

  it("rejects an empty bank and duplicate ids", () => {
    const rng = seededRng(1);
    expect(() => createPlacementSession({ candidates: [], rng })).toThrow(/empty/i);
    const first = syntheticBank[0] as PlacementCandidate;
    expect(() => createPlacementSession({ candidates: [first, first], rng })).toThrow(/duplicate/i);
  });

  it.each<[string, boolean, Level]>([
    ["all correct", true, "C1"],
    ["all wrong", false, "A1"],
  ])("%s over the full bank lands on %s", (_label, correct, level) => {
    const session = run(() => correct, seededRng(3));
    expect(result(session)).toMatchObject({ done: true, level });
  });

  it("stops early when the bank runs out", () => {
    const tiny = syntheticBank.filter((c) => c.id.endsWith("-0"));
    const session = run(() => true, seededRng(1), tiny);
    expect(result(session)).toMatchObject({ done: true, answered: tiny.length });
  });

  it("classifies a θ = 0 examinee as B1 or adjacent in ≥ 80% of 200 seeded runs, never repeating and stopping within 20", () => {
    const adjacent = new Set<Level>(["A2", "B1", "B2"]);
    let hits = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const session = run(examinee(0, seededRng(10_000 + seed)), seededRng(seed));
      const ids = session.answers.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeLessThanOrEqual(20);
      expect(ids.length).toBeGreaterThanOrEqual(15);
      if (adjacent.has(result(session).level)) hits++;
    }
    expect(hits / 200).toBeGreaterThanOrEqual(0.8);
  });
});
