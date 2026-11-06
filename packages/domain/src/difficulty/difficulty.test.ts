import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { localDate } from "../local-date";
import { foldEvents, type ItemHistory } from "../progress-log";
import { DEFAULT_EASE, type Grade, type ReviewState } from "../srs";
import {
  eventsWithConflictsArb,
  gradeArb,
  reviewStateArb,
} from "../test-support/progress-arbitraries";
import { itemReviewed } from "../test-support/progress-events";
import {
  HARD_EASE,
  HARD_RECENT_FAILS,
  MASTERED_INTERVAL_DAYS,
  bucketCounts,
  classifyItems,
  hardItems,
  hardPracticeProgress,
  itemDifficulty,
  type ItemDifficulty,
} from "./difficulty";

const day = localDate("2026-11-01");
const later = localDate("2026-11-05");

function state(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    itemId: "a",
    ease: DEFAULT_EASE,
    intervalDays: 6,
    reps: 2,
    lapses: 0,
    dueDate: day,
    ...overrides,
  };
}

function history(recentGrades: readonly Grade[], overrides: Partial<ItemHistory> = {}) {
  return { itemId: "a", lastSeen: day, lastLapse: null, recentGrades, ...overrides };
}

describe("itemDifficulty", () => {
  it("derives lapses, ease, interval, recent accuracy and last seen", () => {
    const result = itemDifficulty(
      state({ lapses: 1, ease: 2.2, intervalDays: 6 }),
      history([5, 1, 4, 3], { lastSeen: later, lastLapse: day }),
    );
    expect(result).toEqual({
      itemId: "a",
      lapses: 1,
      ease: 2.2,
      intervalDays: 6,
      recentAccuracy: 0.75,
      recentFails: 1,
      lastFailed: false,
      lastSeen: later,
      lastLapse: day,
      score: 3,
      bucket: "learning",
    });
  });

  it("has no accuracy or last seen without history (a baseline state)", () => {
    const result = itemDifficulty(state({ lapses: 3 }), undefined);
    expect(result.recentAccuracy).toBeNull();
    expect(result.lastSeen).toBeNull();
    expect(result.recentFails).toBe(0);
    expect(result.bucket).toBe("learning");
  });

  describe("Difíciles", () => {
    it("the latest answer failed", () => {
      expect(itemDifficulty(state(), history([5, 5, 1])).bucket).toBe("hard");
      expect(itemDifficulty(state(), history([5, 5, 2])).bucket).toBe("hard");
    });

    it(`at least ${HARD_RECENT_FAILS} failing answers among the latest`, () => {
      expect(HARD_RECENT_FAILS).toBe(2);
      expect(itemDifficulty(state(), history([1, 0, 5])).bucket).toBe("hard");
      expect(itemDifficulty(state(), history([1, 5, 5])).bucket).toBe("learning");
    });

    it(`ease at most ${HARD_EASE}`, () => {
      expect(HARD_EASE).toBe(1.7);
      expect(itemDifficulty(state({ ease: 1.7 }), undefined).bucket).toBe("hard");
      expect(itemDifficulty(state({ ease: 1.71 }), undefined).bucket).toBe("learning");
    });

    it("wins over a long interval", () => {
      expect(itemDifficulty(state({ intervalDays: 40 }), history([5, 1])).bucket).toBe("hard");
    });
  });

  it(`Dominadas: interval of ${MASTERED_INTERVAL_DAYS} days or more and not difficult`, () => {
    expect(MASTERED_INTERVAL_DAYS).toBe(21);
    expect(itemDifficulty(state({ intervalDays: 21 }), history([5, 5])).bucket).toBe("mastered");
    expect(itemDifficulty(state({ intervalDays: 20 }), history([5, 5])).bucket).toBe("learning");
  });

  it("scores 3 for a failed latest answer, 2 per recent fail, 2 for low ease, 1 per lapse (≤ 5)", () => {
    expect(itemDifficulty(state(), history([5])).score).toBe(0);
    expect(itemDifficulty(state(), history([1])).score).toBe(3 + 2);
    expect(itemDifficulty(state({ lapses: 9, ease: 1.3 }), history([1, 1])).score).toBe(
      3 + 4 + 2 + 5,
    );
  });
});

describe("classifyItems / bucketCounts / hardItems", () => {
  const states = [
    state({ itemId: "m", intervalDays: 30 }),
    state({ itemId: "l" }),
    state({ itemId: "h1", lapses: 1 }),
    state({ itemId: "h2", lapses: 2 }),
    state({ itemId: "h3", ease: 1.5 }),
  ];
  const histories: ItemHistory[] = [
    history([5, 1], { itemId: "h1", lastSeen: later }),
    history([1, 1], { itemId: "h2", lastSeen: day }),
  ];

  it("classifies every state, sorted by itemId", () => {
    const classified = classifyItems(states, histories);
    expect(classified.map((d) => [d.itemId, d.bucket])).toEqual([
      ["h1", "hard"],
      ["h2", "hard"],
      ["h3", "hard"],
      ["l", "learning"],
      ["m", "mastered"],
    ]);
    expect(bucketCounts(classified)).toEqual({ mastered: 1, learning: 1, hard: 3 });
  });

  it("lists the difficult items hardest first, then most recently seen, then by id", () => {
    expect(hardItems(classifyItems(states, histories)).map((d) => d.itemId)).toEqual([
      "h2", // 3 + 4 + 2 lapses
      "h1", // 3 + 2 + 1 lapse
      "h3", // low ease
    ]);
  });
});

describe("hardPracticeProgress", () => {
  it("counts the practiced difficult items that left Difíciles", () => {
    const before = classifyItems(
      [state({ itemId: "a" }), state({ itemId: "b" }), state({ itemId: "c" })],
      [history([1], { itemId: "a" }), history([1], { itemId: "b" }), history([1], { itemId: "c" })],
    );
    const after = classifyItems(
      [state({ itemId: "a" }), state({ itemId: "b" }), state({ itemId: "c" })],
      [
        history([1, 5], { itemId: "a" }),
        history([1, 1], { itemId: "b" }),
        history([1, 5], { itemId: "c" }),
      ],
    );
    expect(hardPracticeProgress(before, after, ["a", "b"])).toEqual({ practiced: 2, movedOut: 1 });
  });

  it("ignores practiced items that were not difficult before", () => {
    const easy = classifyItems([state()], [history([5])]);
    expect(hardPracticeProgress(easy, easy, ["a"])).toEqual({ practiced: 0, movedOut: 0 });
  });
});

describe("difficulty properties", () => {
  const withHistoryArb = fc
    .tuple(reviewStateArb, fc.array(gradeArb, { minLength: 1, maxLength: 5 }))
    .map(([s, grades]): [ReviewState, ItemHistory] => [s, history(grades, { itemId: s.itemId })]);

  it("puts every item in exactly one bucket, independent of input order", () => {
    fc.assert(
      fc.property(eventsWithConflictsArb, (events) => {
        const { states, itemHistory } = foldEvents(events);
        const classified = classifyItems(states, itemHistory);
        const counts = bucketCounts(classified);
        expect(counts.mastered + counts.learning + counts.hard).toBe(states.length);
        expect(classifyItems([...states].reverse(), [...itemHistory].reverse())).toEqual(
          classified,
        );
        expect(hardItems(classified).length).toBe(counts.hard);
      }),
      { numRuns: 300 },
    );
  });

  it("a failing answer always makes an item difficult; a passing one never adds a recent fail", () => {
    fc.assert(
      fc.property(withHistoryArb, gradeArb, ([s, h], grade) => {
        const before = itemDifficulty(s, h);
        const after = itemDifficulty(s, {
          ...h,
          recentGrades: [...h.recentGrades, grade].slice(-5),
        });
        if (grade < 3) expect(after.bucket).toBe("hard");
        else expect(after.recentFails).toBeLessThanOrEqual(before.recentFails);
      }),
      { numRuns: 500 },
    );
  });

  it("Dominadas always have the mastery interval; Difíciles always match a rule", () => {
    fc.assert(
      fc.property(withHistoryArb, ([s, h]) => {
        const d: ItemDifficulty = itemDifficulty(s, h);
        if (d.bucket === "mastered") expect(d.intervalDays).toBeGreaterThanOrEqual(21);
        const matchesRule =
          d.lastFailed || d.recentFails >= HARD_RECENT_FAILS || d.ease <= HARD_EASE;
        expect(d.bucket === "hard").toBe(matchesRule);
      }),
      { numRuns: 500 },
    );
  });

  it("enough passing answers on an item with ordinary ease lead it out of Difíciles", () => {
    const fold = foldEvents([
      itemReviewed({ id: "e1", localDate: day, occurredAt: 1 }, "s1", "a", 5),
      itemReviewed({ id: "e2", localDate: later, occurredAt: 2 }, "s2", "a", 1),
    ]);
    expect(classifyItems(fold.states, fold.itemHistory)[0]?.bucket).toBe("hard");
    const practiced = foldEvents([
      itemReviewed({ id: "e1", localDate: day, occurredAt: 1 }, "s1", "a", 5),
      itemReviewed({ id: "e2", localDate: later, occurredAt: 2 }, "s2", "a", 1),
      itemReviewed({ id: "e3", localDate: later, occurredAt: 3 }, "s3", "a", 5),
    ]);
    // Not due (a lapse is due tomorrow): the state stays, but the answer counts in the history.
    expect(practiced.states).toEqual(fold.states);
    expect(classifyItems(practiced.states, practiced.itemHistory)[0]?.bucket).toBe("learning");
  });
});
