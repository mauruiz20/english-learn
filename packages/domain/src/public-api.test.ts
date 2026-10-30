import { describe, expect, it } from "vitest";
import {
  LEVELS,
  addDays,
  annotateText,
  answer,
  buildGlossaryIndex,
  createPlacementSession,
  currentQuestion,
  levelFromTheta,
  placementResult,
  gradeFromOutcome,
  initialState,
  isStreakAlive,
  levelProgress,
  localDate,
  matchAnswer,
  recordActivity,
  review,
  scrambleTokens,
  selectSession,
  shuffle,
  shuffleChoices,
  xpForAnswer,
  EMPTY_STREAK,
  EMPTY_PROGRESS,
  applyReview,
  foldEvents,
  uuidv7,
  type Clock,
} from "./index";

const fixedClock = (iso: string, nowMs = 0): Clock => ({
  today: () => localDate(iso),
  nowMs: () => nowMs,
});

describe("public API (barrel)", () => {
  it("drives a review cycle end to end with an injected clock", () => {
    const clock = fixedClock("2026-10-29");
    const today = clock.today();

    const plan = selectSession({
      states: [],
      today,
      newItemIds: ["v1"],
      maxReviews: 10,
      maxNew: 5,
    });
    expect(plan.fresh).toEqual(["v1"]);

    const { verdict } = matchAnswer("I don't know", ["I do not know"]);
    const grade = gradeFromOutcome({ verdict, responseMs: 2000, expectedMs: 5000 });
    const state = review(initialState("v1", today), grade, today);

    expect(xpForAnswer(verdict)).toBe(10);
    expect(state.dueDate).toBe(addDays(today, 1));
    expect(levelProgress({ itemIds: ["v1"], states: [state] }).seen).toBe(1);

    const streak = recordActivity(EMPTY_STREAK, today);
    expect(isStreakAlive(streak, addDays(today, 1))).toBe(true);
  });

  it("exposes rng-injected shuffling helpers", () => {
    const rng = () => 0;
    expect(shuffleChoices({ options: ["a", "b"], answerIndex: 0 }, rng).answerIndex).toBe(1);
    expect(shuffle([1, 2], rng)).toEqual([2, 1]);
    expect(scrambleTokens(["x", "y"], rng)).toEqual(["y", "x"]);
  });

  it("exposes the placement engine", () => {
    const rng = () => 0;
    const session = createPlacementSession({
      candidates: [{ id: "q1", level: "B1", optionCount: 4 }],
      rng,
    });
    const done = answer(session, currentQuestion(session)?.id ?? "", true, rng);
    expect(placementResult(done)).toMatchObject({ done: true, answered: 1 });
    expect(levelFromTheta(0)).toBe("B1");
  });

  it("exposes the CEFR levels in ascending order", () => {
    expect(LEVELS).toEqual(["A1", "A2", "B1", "B2", "C1"]);
  });

  it("exposes the glossary lookup", () => {
    const index = buildGlossaryIndex([
      { id: "g.city", headword: "city", kind: "word", forms: ["city"], senses: [{ es: "ciudad" }] },
    ]);
    expect(annotateText("City!", index).map((s) => s.entryId)).toEqual(["g.city", null]);
  });

  it("exposes the progress event log", () => {
    expect(foldEvents([])).toEqual(EMPTY_PROGRESS);
    expect(uuidv7(0, (n) => new Uint8Array(n))).toBe("00000000-0000-7000-8000-000000000000");
    expect(applyReview(undefined, "v1", 5, localDate("2026-10-29")).reps).toBe(1);
  });
});
