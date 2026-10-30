import { describe, expect, it } from "vitest";
import { localDate } from "../local-date";
import type { Grade, ReviewState } from "./sm2";
import { initialState, MIN_EASE, review } from "./sm2";
import { gradeFromOutcome } from "./grade";
import { selectSession } from "./select-session";

const today = localDate("2026-10-29");

function state(overrides: Partial<ReviewState> & Pick<ReviewState, "itemId">): ReviewState {
  return { ...initialState(overrides.itemId, today), ...overrides };
}

describe("initialState", () => {
  it("starts unseen, due today, with default ease 2.5", () => {
    expect(initialState("v1", today)).toEqual({
      itemId: "v1",
      ease: 2.5,
      intervalDays: 0,
      reps: 0,
      lapses: 0,
      dueDate: "2026-10-29",
    });
  });
});

describe("review (SM-2)", () => {
  it("follows the 1 -> 6 -> round(interval * ease) interval ladder on successful reviews", () => {
    const first = review(initialState("v1", today), 4, today);
    expect(first).toMatchObject({ reps: 1, intervalDays: 1, ease: 2.5, dueDate: "2026-10-30" });

    const second = review(first, 4, localDate("2026-10-30"));
    expect(second).toMatchObject({ reps: 2, intervalDays: 6, dueDate: "2026-11-05" });

    const third = review(second, 4, localDate("2026-11-05"));
    expect(third).toMatchObject({ reps: 3, intervalDays: 15, dueDate: "2026-11-20" });
  });

  it("uses the ease from before this review to grow the interval", () => {
    const reviewed = review(
      state({ itemId: "v1", reps: 2, intervalDays: 10, ease: 2.0 }),
      5,
      today,
    );
    expect(reviewed.intervalDays).toBe(20);
    expect(reviewed.ease).toBeCloseTo(2.1);
  });

  it.each<[Grade, number]>([
    [5, 2.6],
    [4, 2.5],
    [3, 2.36],
    [2, 2.18],
    [1, 1.96],
    [0, 1.7],
  ])("grade %i updates ease 2.5 -> %f", (grade, expectedEase) => {
    expect(review(initialState("v1", today), grade, today).ease).toBeCloseTo(expectedEase, 10);
  });

  it.each<Grade>([0, 1, 2])("grade %i is a lapse: reps reset, interval 1, lapses + 1", (grade) => {
    const reviewed = review(
      state({ itemId: "v1", reps: 5, intervalDays: 40, lapses: 2 }),
      grade,
      today,
    );
    expect(reviewed).toMatchObject({ reps: 0, intervalDays: 1, lapses: 3, dueDate: "2026-10-30" });
  });

  it("never lets ease drop below 1.3", () => {
    let current = initialState("v1", today);
    for (let i = 0; i < 10; i++) current = review(current, 0, today);
    expect(current.ease).toBe(MIN_EASE);
  });

  it("does not mutate the input state", () => {
    const original = initialState("v1", today);
    const snapshot = { ...original };
    review(original, 5, today);
    expect(original).toEqual(snapshot);
  });

  it.each([-1, 6, 2.5, Number.NaN])("rejects invalid grade %f", (grade) => {
    expect(() => review(initialState("v1", today), grade as Grade, today)).toThrow(RangeError);
  });
});

describe("gradeFromOutcome", () => {
  it.each([
    ["wrong", 1000, 5000, 1],
    ["almost", 1000, 5000, 3],
    ["correct", 6000, 5000, 4],
    ["correct", 5000, 5000, 5],
    ["correct", 1000, 5000, 5],
  ] as const)("%s in %ims (expected %ims) -> %i", (verdict, responseMs, expectedMs, grade) => {
    expect(gradeFromOutcome({ verdict, responseMs, expectedMs })).toBe(grade);
  });
});

describe("selectSession", () => {
  const states: ReviewState[] = [
    state({ itemId: "c", dueDate: localDate("2026-10-27"), lapses: 0 }),
    state({ itemId: "b", dueDate: localDate("2026-10-27"), lapses: 3 }),
    state({ itemId: "a", dueDate: localDate("2026-10-27"), lapses: 0 }),
    state({ itemId: "d", dueDate: localDate("2026-10-20"), lapses: 0 }),
    state({ itemId: "e", dueDate: today, lapses: 0 }),
    state({ itemId: "future", dueDate: localDate("2026-10-30"), lapses: 9 }),
  ];

  it("orders due items by dueDate asc, then lapses desc, then itemId, excluding future items", () => {
    const session = selectSession({ states, today, newItemIds: [], maxReviews: 10, maxNew: 5 });
    expect(session.reviews).toEqual(["d", "b", "a", "c", "e"]);
  });

  it("caps reviews", () => {
    const session = selectSession({ states, today, newItemIds: [], maxReviews: 2, maxNew: 5 });
    expect(session.reviews).toEqual(["d", "b"]);
  });

  it("adds new items that have no state yet, capped and deduplicated", () => {
    const session = selectSession({
      states,
      today,
      newItemIds: ["a", "n1", "future", "n2", "n1", "n3"],
      maxReviews: 0,
      maxNew: 2,
    });
    expect(session).toEqual({ reviews: [], fresh: ["n1", "n2"] });
  });

  it("returns empty lists for non-positive caps", () => {
    expect(selectSession({ states, today, newItemIds: ["n1"], maxReviews: -1, maxNew: 0 })).toEqual(
      { reviews: [], fresh: [] },
    );
  });
});
