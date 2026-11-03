import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareLocalDate, type LocalDate } from "../local-date";
import {
  DAILY_PLUMAS_CAP,
  PLUMAS_SOURCES,
  UNCAPPED_PLUMAS_SOURCES,
  type Rewards,
} from "../rewards";
import {
  answerXpArb,
  deviceEventsArb,
  eventsWithConflictsArb,
  studyHistoryArb,
} from "../test-support/progress-arbitraries";
import { lessonCompleted } from "../test-support/progress-events";
import type { StoredEvent } from "./events";
import { foldEvents } from "./fold";

const RUNS = 300;

/** Mixed logs: dense study histories of two devices plus random events (purchases, anomalies). */
const logArb: fc.Arbitrary<StoredEvent[]> = fc
  .tuple(studyHistoryArb("A"), studyHistoryArb("B", 15), eventsWithConflictsArb)
  .map(([a, b, other]) => [...a, ...b, ...other]);

const cappedEarned = (rewards: Rewards) =>
  PLUMAS_SOURCES.filter((source) => !UNCAPPED_PLUMAS_SOURCES.includes(source)).reduce(
    (sum, source) => sum + rewards.earnedBySource[source],
    0,
  );

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

describe("plumas properties", () => {
  it("never come from answer XP: any answerXp gives the same rewards", () => {
    fc.assert(
      fc.property(logArb, fc.infiniteStream(answerXpArb), (events, xps) => {
        const reXp = events.map((event) =>
          event.type === "session_completed" &&
          typeof event.payload === "object" &&
          event.payload !== null &&
          "answerXp" in event.payload
            ? { ...event, payload: { ...event.payload, answerXp: xps.next().value as number } }
            : event,
        );
        expect(foldEvents(reXp).rewards).toEqual(foldEvents(events).rewards);
      }),
      { numRuns: RUNS },
    );
  });

  it("holds the daily cap: the capped sources pay at most 40 on any date", () => {
    fc.assert(
      fc.property(logArb, (events) => {
        const dates = [...new Set(events.map((e) => e.localDate))].sort((a, b) =>
          compareLocalDate(a as LocalDate, b as LocalDate),
        );
        // Fold order is by date first, so folding the events up to a date is a prefix of the fold.
        let previous = 0;
        for (const date of dates) {
          const upTo = events.filter((e) => e.localDate <= date);
          const capped = cappedEarned(foldEvents(upTo).rewards);
          expect(capped - previous).toBeLessThanOrEqual(DAILY_PLUMAS_CAP);
          previous = capped;
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("pays nothing for redoing an already-perfect lesson on a day already studied", () => {
    fc.assert(
      fc.property(studyHistoryArb("A"), fc.nat(), (events, pick) => {
        const before = foldEvents(events);
        const perfect = before.lessonResults.filter((r) => r.bestAccuracy === 1);
        const lastDate = before.activeDates.at(-1);
        if (perfect.length === 0 || lastDate === undefined) return;
        const lesson = perfect[pick % perfect.length]!;
        const redo = lessonCompleted(
          { id: "redo", localDate: lastDate, occurredAt: 1e9 },
          "redo-session",
          lesson.lessonId,
          50,
          1,
        );
        expect(foldEvents([...events, redo]).rewards).toEqual(before.rewards);
      }),
      { numRuns: RUNS },
    );
  });

  it("keeps the books: balance = earned − spent, sources add up, each item charged once", () => {
    fc.assert(
      fc.property(studyHistoryArb("A"), deviceEventsArb("C"), deviceEventsArb("D"), (a, c, d) => {
        // Distinct ids: the oracle below needs no conflicting copies.
        const all = [...a, ...c, ...d, ...c.slice(0, 3)];
        const { rewards } = foldEvents(all);
        expect(rewards.balance).toBe(rewards.earned - rewards.spent);
        expect(sum(Object.values(rewards.earnedBySource))).toBe(rewards.earned);
        // Each owned item was charged exactly once: by its first purchase in fold order.
        const charged = new Map<string, number>();
        for (const event of sortForFold(all)) {
          if (event.type !== "item_purchased") continue;
          const { itemId, price } = event.payload as { itemId: string; price: number };
          if (!charged.has(itemId)) charged.set(itemId, price);
        }
        expect(rewards.ownedItemIds).toEqual([...charged.keys()].sort());
        expect(rewards.spent).toBe(sum([...charged.values()]));
      }),
      { numRuns: RUNS },
    );
  });
});

/** Fold order of events whose ids are unique (identical copies dropped). */
function sortForFold(events: readonly StoredEvent[]): StoredEvent[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  return [...byId.values()].sort(
    (a, b) =>
      a.localDate.localeCompare(b.localDate) ||
      a.occurredAt - b.occurredAt ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
