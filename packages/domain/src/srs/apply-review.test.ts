import { describe, expect, it } from "vitest";
import { localDate } from "../local-date";
import { applyReview } from "./apply-review";
import { initialState, review, type Grade, type ReviewState } from "./sm2";

// Characterization tests ported from the app's `applyLessonResults` cases, so moving the
// rule into the domain cannot change behavior.
const today = localDate("2026-10-29");

describe("applyReview", () => {
  it("reviews a new item from initialState when it is passed", () => {
    expect(applyReview(undefined, "new", 5, today)).toEqual(
      review(initialState("new", today), 5, today),
    );
  });

  it.each<Grade>([3, 4])("reviews a new item passed with grade %i", (grade) => {
    expect(applyReview(undefined, "new", grade, today)).toEqual(
      review(initialState("new", today), grade, today),
    );
  });

  it.each<Grade>([0, 1, 2])(
    "starts a new item missed with grade %i fresh: due tomorrow, no lapse, default ease",
    (grade) => {
      expect(applyReview(undefined, "new", grade, today)).toEqual({
        ...initialState("new", today),
        intervalDays: 1,
        dueDate: localDate("2026-10-30"),
      });
    },
  );

  it("reviews an existing state from where it was (lapse)", () => {
    const existing: ReviewState = {
      ...initialState("known", localDate("2026-10-01")),
      reps: 2,
      intervalDays: 6,
    };
    const state = applyReview(existing, "known", 1, today);
    expect(state).toEqual(review(existing, 1, today));
    expect(state.lapses).toBe(1);
  });

  it("keeps a non-due item unchanged when it is passed (practice only)", () => {
    const learned = review(initialState("a", today), 5, today);
    expect(applyReview(learned, "a", 3, today)).toBe(learned);
    expect(applyReview(learned, "a", 5, today)).toBe(learned);
  });

  it("still lapses a non-due item answered wrong", () => {
    const known: ReviewState = {
      ...initialState("a", localDate("2026-10-01")),
      reps: 3,
      intervalDays: 15,
      dueDate: localDate("2026-11-10"),
    };
    const state = applyReview(known, "a", 1, today);
    expect(state).toEqual(review(known, 1, today));
    expect(state.dueDate).toBe(localDate("2026-10-30"));
  });

  it("reviews an item due today normally", () => {
    const due = review(initialState("a", localDate("2026-10-28")), 5, localDate("2026-10-28"));
    const state = applyReview(due, "a", 5, today);
    expect(state).toEqual(review(due, 5, today));
    expect(state.intervalDays).toBe(6);
  });

  it("reviews an overdue item normally", () => {
    const overdue: ReviewState = {
      ...initialState("a", localDate("2026-10-01")),
      reps: 2,
      intervalDays: 6,
      dueDate: localDate("2026-10-07"),
    };
    expect(applyReview(overdue, "a", 4, today)).toEqual(review(overdue, 4, today));
  });

  it("rejects an invalid grade", () => {
    expect(() => applyReview(undefined, "a", 7 as Grade, today)).toThrow(RangeError);
  });
});
