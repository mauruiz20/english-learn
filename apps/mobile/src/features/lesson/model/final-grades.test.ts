import { EXPECTED_MS, finalGrades } from "./final-grades";
import type { LessonSummary } from "./lesson-session";

function summary(itemOutcomes: LessonSummary["itemOutcomes"]): LessonSummary {
  return {
    lessonId: "a2.routine.lesson-001",
    verdicts: [],
    accuracy: 1,
    answerXp: 0,
    itemOutcomes,
  };
}

describe("finalGrades", () => {
  it("grades each practiced item once, in order of first appearance", () => {
    const grades = finalGrades(
      summary([
        { itemId: "b", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
        { itemId: "a", exerciseType: "vocab", verdict: "almost", responseMs: 1000 },
        { itemId: "c", exerciseType: "vocab", verdict: "wrong", responseMs: 1000 },
      ]),
    );

    expect([...grades]).toEqual([
      ["b", 5],
      ["a", 3],
      ["c", 1],
    ]);
  });

  it("keeps the worst grade when an item appears in several exercises", () => {
    const grades = finalGrades(
      summary([
        { itemId: "a", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
        { itemId: "b", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
        { itemId: "a", exerciseType: "translate_write", verdict: "almost", responseMs: 1000 },
        { itemId: "a", exerciseType: "cloze", verdict: "correct", responseMs: 1000 },
      ]),
    );

    expect([...grades]).toEqual([
      ["a", 3],
      ["b", 5],
    ]);
  });

  it("grades slow correct answers lower using the per-type expected time", () => {
    const slow = EXPECTED_MS.translate_write + 1;
    const grades = finalGrades(
      summary([
        { itemId: "a", exerciseType: "translate_write", verdict: "correct", responseMs: slow },
        {
          itemId: "b",
          exerciseType: "translate_write",
          verdict: "correct",
          responseMs: EXPECTED_MS.translate_write,
        },
      ]),
    );

    expect([...grades]).toEqual([
      ["a", 4],
      ["b", 5],
    ]);
  });

  it("returns nothing for a session without items", () => {
    expect(finalGrades(summary([])).size).toBe(0);
  });

  it("documents an expected time for every exercise type", () => {
    expect(Object.keys(EXPECTED_MS).sort()).toEqual([
      "cloze",
      "listen",
      "reading",
      "translate_write",
      "translation_choice",
      "vocab",
      "word_order",
    ]);
  });

  describe("words looked up before answering", () => {
    it("caps a correct answer at grade 3 (almost) and leaves other items alone", () => {
      const grades = finalGrades(
        summary([
          {
            itemId: "a",
            exerciseType: "vocab",
            verdict: "correct",
            responseMs: 1000,
            lookedUp: true,
          },
          { itemId: "b", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
        ]),
      );

      expect([...grades]).toEqual([
        ["a", 3],
        ["b", 5],
      ]);
    });

    it("never upgrades a wrong answer", () => {
      const grades = finalGrades(
        summary([
          {
            itemId: "a",
            exerciseType: "cloze",
            verdict: "wrong",
            responseMs: 1000,
            lookedUp: true,
          },
        ]),
      );

      expect(grades.get("a")).toBe(1);
    });
  });
});

describe("finalGrades: answers the learner marked as correct", () => {
  it("grades a disputed answer 4 (correct, not perfect), however fast it was", () => {
    const grades = finalGrades(
      summary([
        {
          itemId: "a",
          exerciseType: "translate_write",
          verdict: "correct",
          responseMs: 1000,
          disputed: true,
        },
      ]),
    );
    expect(grades.get("a")).toBe(4);
  });

  it("the regraded answer takes part in worst-grade-wins", () => {
    const grades = finalGrades(
      summary([
        { itemId: "a", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
        {
          itemId: "a",
          exerciseType: "translate_write",
          verdict: "correct",
          responseMs: 1000,
          disputed: true,
        },
        { itemId: "b", exerciseType: "vocab", verdict: "wrong", responseMs: 1000 },
        {
          itemId: "b",
          exerciseType: "translate_write",
          verdict: "correct",
          responseMs: 1000,
          disputed: true,
        },
      ]),
    );
    expect([...grades]).toEqual([
      ["a", 4],
      ["b", 1],
    ]);
  });

  it("still applies the looked-up cap", () => {
    const grades = finalGrades(
      summary([
        {
          itemId: "a",
          exerciseType: "translate_write",
          verdict: "correct",
          responseMs: 1000,
          disputed: true,
          lookedUp: true,
        },
      ]),
    );
    expect(grades.get("a")).toBe(3);
  });
});
