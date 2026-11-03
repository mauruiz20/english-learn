import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays } from "../local-date";
import {
  START,
  deviceEventsArb,
  eventsWithConflictsArb,
} from "../test-support/progress-arbitraries";
import { itemReviewed, lessonCompleted, reviewCompleted } from "../test-support/progress-events";
import type { StoredEvent } from "./events";
import {
  EMPTY_FOLD_SNAPSHOT,
  advanceFold,
  foldEvents,
  foldSnapshot,
  snapshotProgress,
  type FoldSnapshot,
} from "./fold";

const RUNS = 500;

/**
 * Inserts `batches` one after the other into a log keyed by id (an id already stored is ignored,
 * like the SQLite `event` table) and keeps a snapshot up to date the way the store does: advance
 * with the events actually added, refold the whole log when the advance refuses. After every
 * batch, checks the snapshot against a full refold of the log. Counts the advances and refolds.
 */
function replay(batches: readonly (readonly StoredEvent[])[]): {
  advances: number;
  refolds: number;
} {
  const log: StoredEvent[] = [];
  const ids = new Set<string>();
  let snapshot: FoldSnapshot = EMPTY_FOLD_SNAPSHOT;
  let refolds = 0;
  let advances = 0;
  for (const batch of batches) {
    // Within one batch an id may repeat: only ids the log already holds are left out.
    const added = batch.filter((event) => !ids.has(event.id));
    for (const event of added) ids.add(event.id);
    log.push(...added);
    const advanced = advanceFold(snapshot, added);
    if (advanced === null) refolds += 1;
    else if (added.length > 0) advances += 1;
    snapshot = advanced ?? foldSnapshot(log);
    expect(snapshot).toEqual(foldSnapshot(log));
    expect(snapshotProgress(snapshot)).toEqual(foldEvents(log));
  }
  return { advances, refolds };
}

/** Splits `events` into consecutive batches at the given cut points. */
function split<T>(events: readonly T[], cuts: readonly number[]): T[][] {
  const at = [...new Set(cuts.map((cut) => cut % (events.length + 1)))].sort((a, b) => a - b);
  const batches: T[][] = [];
  let start = 0;
  for (const end of [...at, events.length]) {
    batches.push(events.slice(start, end));
    start = end;
  }
  return batches;
}

/** One session of `items` reviews and its completion, all on `day` (as the app writes them). */
function session(n: number, items: number): StoredEvent[] {
  const localDate = addDays(START, Math.floor(n / 3));
  const meta = (k: number) => ({ id: `s${n}-${k}`, localDate, occurredAt: n * 100 + k });
  const sessionId = `session-${n}`;
  return [
    ...Array.from({ length: items }, (_, k) =>
      itemReviewed(meta(k), sessionId, `i${(n + k) % 7}`, ((n + k) % 6) as 0),
    ),
    n % 2 === 0
      ? lessonCompleted(meta(items), sessionId, `L${n % 4}`, 10 * items, (n % 5) / 4)
      : reviewCompleted(meta(items), sessionId, 5 * items, 1),
  ];
}

describe("incremental fold (advanceFold)", () => {
  it("always equals a full refold, whatever the batches, their order and duplicates", () => {
    fc.assert(
      fc.property(
        eventsWithConflictsArb,
        deviceEventsArb("B"),
        fc.array(fc.nat(60), { maxLength: 6 }),
        fc.array(fc.nat(60), { maxLength: 6 }),
        fc.array(fc.nat(30), { maxLength: 8 }),
        (a, b, cutsA, cutsB, redelivered) => {
          // Device A's batches arrive in order, then device B's (with dates anywhere, so many
          // sort before the cursor), then copies of already stored events (sync re-delivery).
          const again = redelivered.flatMap((n) => {
            const event = a[n % (a.length || 1)];
            return event === undefined ? [] : [structuredClone(event)];
          });
          replay([...split(a, cutsA), ...split(b, cutsB), again]);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("equals a full refold when one device's batches interleave with another's", () => {
    fc.assert(
      fc.property(
        deviceEventsArb("A"),
        deviceEventsArb("B"),
        fc.infiniteStream(fc.nat(4)),
        (a, b, sizes) => {
          const batches: StoredEvent[][] = [];
          let i = 0;
          let j = 0;
          for (const size of sizes) {
            if (i === a.length && j === b.length) break;
            const fromA = batches.length % 2 === 0;
            const source = fromA ? a : b;
            const start = fromA ? i : j;
            batches.push(source.slice(start, start + size + 1));
            if (fromA) i = Math.min(a.length, i + size + 1);
            else j = Math.min(b.length, j + size + 1);
          }
          replay(batches);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("equals a full refold when batches mostly arrive in fold order (the incremental path)", () => {
    const totals = { advances: 0, refolds: 0 };
    fc.assert(
      fc.property(
        eventsWithConflictsArb,
        fc.array(fc.nat(60), { maxLength: 8 }),
        (events, cuts) => {
          const inOrder = [...events].sort(
            (x, y) =>
              x.localDate.localeCompare(y.localDate) ||
              x.occurredAt - y.occurredAt ||
              x.id.localeCompare(y.id),
          );
          const { advances, refolds } = replay(split(inOrder, cuts));
          totals.advances += advances;
          totals.refolds += refolds;
        },
      ),
      { numRuns: RUNS },
    );
    // Both paths run: most batches advance; recurring sessions and conflicting ids refold.
    expect(totals.advances).toBeGreaterThan(totals.refolds);
    expect(totals.refolds).toBeGreaterThan(0);
  });

  it("applies sessions saved in fold order without ever refolding", () => {
    const batches = Array.from({ length: 40 }, (_, n) => session(n, 1 + (n % 5)));
    expect(replay(batches)).toEqual({ advances: 40, refolds: 0 });
  });

  it("refuses (asks for a refold) an event that sorts before the latest one folded", () => {
    const snapshot = foldSnapshot(session(5, 2));
    expect(advanceFold(snapshot, session(1, 2))).toBeNull();
  });

  it("refuses an event whose envelope cannot be ordered", () => {
    const snapshot = foldSnapshot(session(1, 2));
    const [event] = session(2, 1);
    expect(advanceFold(snapshot, [{ ...event!, localDate: "not-a-date" }])).toBeNull();
  });

  it("refuses a review for a session it already holds reviews of", () => {
    const snapshot = foldSnapshot(session(1, 2));
    const late = itemReviewed(
      { id: "late", localDate: addDays(START, 9), occurredAt: 9_999 },
      "session-1",
      "i5",
      5,
    );
    expect(advanceFold(snapshot, [late])).toBeNull();
  });

  it("reports a later completion of a completed session without refolding", () => {
    const log = session(1, 2);
    const again = reviewCompleted(
      { id: "again", localDate: addDays(START, 9), occurredAt: 9_999 },
      "session-1",
      50,
      1,
    );
    const advanced = advanceFold(foldSnapshot(log), [again]);
    expect(advanced).toEqual(foldSnapshot([...log, again]));
    expect(snapshotProgress(advanced!).anomalies).toEqual([
      { kind: "duplicate_session", eventId: "again", detail: "session-1" },
    ]);
  });

  it("returns the same snapshot for no events", () => {
    const snapshot = foldSnapshot(session(1, 2));
    expect(advanceFold(snapshot, [])).toEqual(snapshot);
  });

  it("survives a JSON round trip unchanged, so it can be persisted next to a JSON log", () => {
    fc.assert(
      fc.property(eventsWithConflictsArb, (events) => {
        // Stored events went through JSON (which has no -0), like the snapshot will.
        const snapshot = foldSnapshot(JSON.parse(JSON.stringify(events)) as StoredEvent[]);
        expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
      }),
      { numRuns: RUNS },
    );
  });
});
