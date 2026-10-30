import { initialState, localDate, review, type ReviewState } from "@english-learn/domain";
import { applyLessonResults, EXPECTED_MS } from "./apply-lesson-results";
import type { LessonSummary } from "./lesson-session";

const today = localDate("2026-10-29");

function summary(itemOutcomes: LessonSummary["itemOutcomes"]): LessonSummary {
  return {
    lessonId: "a2.routine.lesson-001",
    verdicts: [],
    accuracy: 1,
    xpEarned: 0,
    itemOutcomes,
  };
}

describe("applyLessonResults", () => {
  it("creates a reviewed state for new items", () => {
    const states = applyLessonResults({
      summary: summary([
        { itemId: "new", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
      ]),
      states: [],
      today,
    });

    expect(states).toEqual([review(initialState("new", today), 5, today)]);
  });

  it("reviews existing states from where they were", () => {
    const existing: ReviewState = {
      ...initialState("known", localDate("2026-10-01")),
      reps: 2,
      intervalDays: 6,
    };

    const [state] = applyLessonResults({
      summary: summary([
        { itemId: "known", exerciseType: "vocab", verdict: "wrong", responseMs: 1000 },
      ]),
      states: [existing],
      today,
    });

    expect(state).toEqual(review(existing, 1, today));
    expect(state?.lapses).toBe(1);
  });

  it("grades slow correct answers lower using the per-type expected time", () => {
    const slow = EXPECTED_MS.translate_write + 1;
    const [state] = applyLessonResults({
      summary: summary([
        { itemId: "a", exerciseType: "translate_write", verdict: "correct", responseMs: slow },
      ]),
      states: [],
      today,
    });

    expect(state).toEqual(review(initialState("a", today), 4, today));
  });

  it("uses the worst grade when an item appears in several exercises", () => {
    const states = applyLessonResults({
      summary: summary([
        { itemId: "a", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
        { itemId: "b", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
        { itemId: "a", exerciseType: "translate_write", verdict: "almost", responseMs: 1000 },
      ]),
      states: [],
      today,
    });

    expect(states).toEqual([
      review(initialState("a", today), 3, today),
      review(initialState("b", today), 5, today),
    ]);
  });

  it("leaves items outside the lesson untouched", () => {
    const other = initialState("other", today);

    expect(applyLessonResults({ summary: summary([]), states: [other], today })).toEqual([]);
  });

  it("documents an expected time for every exercise type", () => {
    expect(Object.keys(EXPECTED_MS).sort()).toEqual([
      "cloze",
      "reading",
      "translate_write",
      "translation_choice",
      "vocab",
      "word_order",
    ]);
  });
});
