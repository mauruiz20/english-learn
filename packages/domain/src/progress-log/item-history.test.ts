import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareLocalDate, localDate } from "../local-date";
import { initialState } from "../srs";
import { eventsWithConflictsArb } from "../test-support/progress-arbitraries";
import { baselineImported, itemReviewed } from "../test-support/progress-events";
import { EMPTY_STREAK } from "../streak";
import { EMPTY_PROGRESS, RECENT_GRADES, foldEvents } from "./fold";

const d1 = localDate("2026-10-27");
const d2 = localDate("2026-10-28");
const d3 = localDate("2026-10-29");

describe("foldEvents item history", () => {
  it("is empty for an empty log", () => {
    expect(foldEvents([]).itemHistory).toEqual([]);
    expect(EMPTY_PROGRESS.itemHistory).toEqual([]);
  });

  it("records, per item, the last date it was answered and its latest grades, oldest first", () => {
    const { itemHistory } = foldEvents([
      itemReviewed({ id: "e1", localDate: d1, occurredAt: 1 }, "s1", "b", 5),
      itemReviewed({ id: "e2", localDate: d1, occurredAt: 2 }, "s1", "a", 4),
      itemReviewed({ id: "e3", localDate: d2, occurredAt: 3 }, "s2", "a", 3),
    ]);
    expect(itemHistory).toEqual([
      { itemId: "a", lastSeen: d2, lastLapse: null, recentGrades: [4, 3] },
      { itemId: "b", lastSeen: d1, lastLapse: null, recentGrades: [5] },
    ]);
  });

  it(`keeps only the latest ${RECENT_GRADES} grades`, () => {
    const events = [5, 4, 3, 5, 4, 1, 5].map((grade, k) =>
      itemReviewed({ id: `e${k}`, localDate: d1, occurredAt: k }, `s${k}`, "a", grade as 5),
    );
    expect(foldEvents(events).itemHistory[0]?.recentGrades).toEqual([3, 5, 4, 1, 5]);
    expect(RECENT_GRADES).toBe(5);
  });

  it("dates a lapse only when the item already had a state (first sight is not forgetting)", () => {
    const firstSight = foldEvents([
      itemReviewed({ id: "e1", localDate: d1, occurredAt: 1 }, "s1", "a", 1),
    ]);
    expect(firstSight.itemHistory[0]?.lastLapse).toBeNull();
    expect(firstSight.states[0]?.lapses).toBe(0);

    const lapsed = foldEvents([
      itemReviewed({ id: "e1", localDate: d1, occurredAt: 1 }, "s1", "a", 1),
      itemReviewed({ id: "e2", localDate: d2, occurredAt: 2 }, "s2", "a", 2),
      itemReviewed({ id: "e3", localDate: d3, occurredAt: 3 }, "s3", "a", 5),
    ]);
    expect(lapsed.itemHistory[0]).toEqual({
      itemId: "a",
      lastSeen: d3,
      lastLapse: d2,
      recentGrades: [1, 2, 5],
    });
    expect(lapsed.states[0]?.lapses).toBe(1);
  });

  it("records an answer to an item that is not due yet, though its state stays put", () => {
    const { states, itemHistory } = foldEvents([
      itemReviewed({ id: "e1", localDate: d1, occurredAt: 1 }, "s1", "a", 5),
      itemReviewed({ id: "e2", localDate: d1, occurredAt: 2 }, "s2", "a", 4),
    ]);
    expect(states[0]?.reps).toBe(1);
    expect(itemHistory[0]?.recentGrades).toEqual([5, 4]);
  });

  it("ignores a duplicate review in the same session, like the state does", () => {
    const { itemHistory } = foldEvents([
      itemReviewed({ id: "e1", localDate: d1, occurredAt: 1 }, "s1", "a", 5),
      itemReviewed({ id: "e2", localDate: d1, occurredAt: 2 }, "s1", "a", 1),
    ]);
    expect(itemHistory[0]?.recentGrades).toEqual([5]);
  });

  it("gives baseline states no history, but a later lapse on them is dated", () => {
    const baseline = baselineImported(
      { id: "b1", localDate: d1 },
      {
        states: [{ ...initialState("a", d1), reps: 2, intervalDays: 6 }],
        xp: 0,
        streak: EMPTY_STREAK,
        placement: null,
      },
    );
    expect(foldEvents([baseline]).itemHistory).toEqual([]);
    const { itemHistory } = foldEvents([
      baseline,
      itemReviewed({ id: "e1", localDate: d2, occurredAt: 1 }, "s1", "a", 1),
    ]);
    expect(itemHistory).toEqual([{ itemId: "a", lastSeen: d2, lastLapse: d2, recentGrades: [1] }]);
  });
});

describe("item history properties", () => {
  it("agrees with the review states of a log without baselines", () => {
    fc.assert(
      fc.property(eventsWithConflictsArb, (events) => {
        const { states, itemHistory } = foldEvents(
          events.filter((event) => event.type !== "baseline_imported"),
        );
        // Every reviewed item has both, and only those.
        expect(itemHistory.map((h) => h.itemId)).toEqual(states.map((s) => s.itemId));
        for (const [i, history] of itemHistory.entries()) {
          const state = states[i];
          // A dated lapse exactly when the state counted one.
          expect(history.lastLapse !== null).toBe((state?.lapses ?? 0) > 0);
          if (history.lastLapse !== null) {
            expect(compareLocalDate(history.lastLapse, history.lastSeen)).toBeLessThanOrEqual(0);
          }
          expect(history.recentGrades.length).toBeGreaterThan(0);
          expect(history.recentGrades.length).toBeLessThanOrEqual(RECENT_GRADES);
        }
      }),
      { numRuns: 500 },
    );
  });
});
