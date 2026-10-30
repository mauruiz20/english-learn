import { initialState, localDate, review, type ReviewState } from "@english-learn/domain";
import { applyLessonResults, EXPECTED_MS } from "./apply-lesson-results";
import type { LessonSummary } from "./lesson-session";

const today = localDate("2026-10-29");

function summary(itemOutcomes: LessonSummary["itemOutcomes"]): LessonSummary {
  return {
    lessonId: "a2.routine.lesson-001",
    verdicts: [],
    accuracy: 1,
    answerXp: 0,
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

  it("starts a new item answered wrong fresh: due tomorrow, no lapse, default ease", () => {
    // First sight is not forgetting: nothing was learned yet, so nothing lapsed.
    const states = applyLessonResults({
      summary: summary([
        { itemId: "new", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
        { itemId: "new", exerciseType: "cloze", verdict: "wrong", responseMs: 1000 },
      ]),
      states: [],
      today,
    });

    expect(states).toEqual([
      { ...initialState("new", today), intervalDays: 1, dueDate: localDate("2026-10-30") },
    ]);
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

  it("keeps the interval of a non-due item practiced again today", () => {
    // Learned today: next review is tomorrow. Replaying the lesson today is practice only.
    const learned = review(initialState("a", today), 5, today);

    const states = applyLessonResults({
      summary: summary([
        { itemId: "a", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
        { itemId: "a", exerciseType: "cloze", verdict: "almost", responseMs: 1000 },
      ]),
      states: [learned],
      today,
    });

    expect(states).toEqual([learned]);
  });

  it("still lapses a non-due item answered wrong", () => {
    const known: ReviewState = {
      ...initialState("a", localDate("2026-10-01")),
      reps: 3,
      intervalDays: 15,
      dueDate: localDate("2026-11-10"),
    };

    const [state] = applyLessonResults({
      summary: summary([
        { itemId: "a", exerciseType: "vocab", verdict: "wrong", responseMs: 1000 },
      ]),
      states: [known],
      today,
    });

    expect(state).toEqual(review(known, 1, today));
    expect(state?.dueDate).toBe(localDate("2026-10-30"));
  });

  it("reviews an item due today normally", () => {
    const due: ReviewState = {
      ...review(initialState("a", localDate("2026-10-28")), 5, localDate("2026-10-28")),
    };

    const [state] = applyLessonResults({
      summary: summary([
        { itemId: "a", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
      ]),
      states: [due],
      today,
    });

    expect(state).toEqual(review(due, 5, today));
    expect(state?.intervalDays).toBe(6);
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

  describe("words looked up before answering", () => {
    it("caps a correct answer at grade 3 (almost)", () => {
      const states = applyLessonResults({
        summary: summary([
          {
            itemId: "new",
            exerciseType: "vocab",
            verdict: "correct",
            responseMs: 1000,
            lookedUp: true,
          },
        ]),
        states: [],
        today,
      });

      expect(states).toEqual([review(initialState("new", today), 3, today)]);
    });

    it("never upgrades a wrong answer", () => {
      const existing: ReviewState = { ...initialState("known", today), reps: 2, intervalDays: 6 };
      const states = applyLessonResults({
        summary: summary([
          {
            itemId: "known",
            exerciseType: "cloze",
            verdict: "wrong",
            responseMs: 1000,
            lookedUp: true,
          },
        ]),
        states: [existing],
        today,
      });

      expect(states).toEqual([review(existing, 1, today)]);
    });

    it("leaves items that were not looked up alone", () => {
      const states = applyLessonResults({
        summary: summary([
          {
            itemId: "a",
            exerciseType: "vocab",
            verdict: "correct",
            responseMs: 1000,
            lookedUp: true,
          },
          { itemId: "b", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
        ]),
        states: [],
        today,
      });

      expect(states).toEqual([
        review(initialState("a", today), 3, today),
        review(initialState("b", today), 5, today),
      ]);
    });
  });
});
