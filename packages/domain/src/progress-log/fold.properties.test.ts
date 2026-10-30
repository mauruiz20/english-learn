import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays, compareLocalDate, type LocalDate } from "../local-date";
import type { PlacementResult } from "../ports";
import { xpForLessonCompletion } from "../scoring";
import { initialState, review, type Grade, type ReviewState } from "../srs";
import { EMPTY_STREAK, recordActivity, type Streak } from "../streak";
import {
  START,
  accuracyArb,
  answerXpArb,
  deviceEventsArb,
  eventsWithConflictsArb,
  gradeArb,
  levelArb,
  permutationArb,
  thetaArb,
} from "../test-support/progress-arbitraries";
import {
  baselineImported,
  itemReviewed,
  lessonCompleted,
  placementCompleted,
  reviewCompleted,
} from "../test-support/progress-events";
import type { StoredEvent } from "./events";
import { foldEvents } from "./fold";
import { uuidv7 } from "./uuidv7";

const RUNS = 500;

describe("foldEvents properties", () => {
  it("1. is invariant under any permutation of the events", () => {
    fc.assert(
      fc.property(
        eventsWithConflictsArb.chain((events) =>
          fc.tuple(fc.constant(events), permutationArb(events)),
        ),
        ([events, shuffled]) => {
          expect(foldEvents(shuffled)).toEqual(foldEvents(events));
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("2. is idempotent: duplicating any subset of events changes nothing", () => {
    fc.assert(
      fc.property(
        eventsWithConflictsArb.chain((events) =>
          fc.tuple(
            fc.constant(events),
            fc
              .subarray(events)
              .chain((extra) =>
                permutationArb([...events, ...extra.map((e) => structuredClone(e))]),
              ),
          ),
        ),
        ([events, withDuplicates]) => {
          expect(foldEvents(withDuplicates)).toEqual(foldEvents(events));
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("3. converges on the union of two devices whatever the batch order or interleaving", () => {
    fc.assert(
      fc.property(
        deviceEventsArb("A"),
        deviceEventsArb("B"),
        fc.infiniteStream(fc.boolean()),
        (a, b, coin) => {
          const interleaved: StoredEvent[] = [];
          let i = 0;
          let j = 0;
          for (const takeA of coin) {
            if (i === a.length && j === b.length) break;
            if ((takeA && i < a.length) || j === b.length) interleaved.push(a[i++]!);
            else interleaved.push(b[j++]!);
          }
          const onA = foldEvents([...a, ...b]);
          expect(foldEvents([...b, ...a])).toEqual(onA);
          expect(foldEvents(interleaved)).toEqual(onA);
          // Each device already holds its own events and receives the other's (with overlap).
          expect(foldEvents([...a, ...b, ...a.slice(0, 3)])).toEqual(onA);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("5. pays the first-time lesson bonus once across devices that completed it offline", () => {
    const completions = (deviceId: string) =>
      fc
        .array(
          fc.record({
            lessonId: fc.constantFrom("L0", "L1", "L2"),
            day: fc.integer({ min: 0, max: 5 }),
            occurredAt: fc.integer({ min: 0, max: 3 }),
            answerXp: answerXpArb,
            accuracy: accuracyArb,
          }),
          { minLength: 1, maxLength: 8 },
        )
        .map((rows) =>
          rows.map((r, n) => ({
            ...r,
            event: lessonCompleted(
              {
                id: `${deviceId}-${n}`,
                deviceId,
                localDate: addDays(START, r.day),
                occurredAt: r.occurredAt,
              },
              `${deviceId}-session-${n}`,
              r.lessonId,
              r.answerXp,
              r.accuracy,
            ),
          })),
        );
    fc.assert(
      fc.property(completions("A"), completions("B"), (a, b) => {
        const all = [...a, ...b];
        const folded = foldEvents(all.map((r) => r.event));
        const firstOf = new Map<string, (typeof all)[number]>();
        for (const r of all) {
          const prev = firstOf.get(r.lessonId);
          if (prev === undefined || orderKey(r.event) < orderKey(prev.event))
            firstOf.set(r.lessonId, r);
        }
        const answerXp = all.reduce((sum, r) => sum + r.answerXp, 0);
        const bonus = [...firstOf.values()].reduce(
          (s, r) => s + xpForLessonCompletion(r.accuracy),
          0,
        );
        expect(folded.xp).toBe(answerXp + bonus);
        expect(folded.completedLessonIds).toEqual([...firstOf.keys()].sort());
      }),
      { numRuns: RUNS },
    );
  });
});

/** Sortable key matching the fold's total order for envelopes with small occurredAt values. */
function orderKey(e: StoredEvent): string {
  return `${e.localDate}|${String(e.occurredAt).padStart(4, "0")}|${e.id}`;
}

// ---------------------------------------------------------------------------------------------
// 4. Single-device oracle: the CURRENT app rules (copied from apps/mobile before this change)
// replayed step by step must give the same progress as folding the events the app would write.
// ---------------------------------------------------------------------------------------------

type Catalog = Readonly<Record<string, readonly string[]>>;

/** Lessons share items, as in the real content (80 of 243 items appear in several lessons). */
const SHARED: Catalog = {
  L0: ["i0", "i1", "i2"],
  L1: ["i2", "i3"],
  L2: ["i3", "i4", "i5"],
  L3: ["i0", "i5"],
};
const DISJOINT: Catalog = { L0: ["i0", "i1"], L1: ["i2", "i3"], L2: ["i4"], L3: ["i5"] };
const LOOKED_UP_MAX_GRADE: Grade = 3;

type Outcome = { readonly itemId: string; readonly grade: Grade; readonly lookedUp: boolean };
type Step =
  | {
      readonly kind: "lesson";
      readonly advance: number;
      readonly lessonId: string;
      readonly outcomes: readonly Outcome[];
      readonly answerXp: number;
      readonly accuracy: number;
    }
  | {
      readonly kind: "review";
      readonly advance: number;
      readonly outcomes: readonly Outcome[];
      readonly answerXp: number;
      readonly accuracy: number;
    }
  | { readonly kind: "placement"; readonly advance: number; readonly placement: PlacementResult };

const outcomesFor = (itemIds: readonly string[]) =>
  fc
    .tuple(
      ...itemIds.map((itemId) =>
        fc.array(
          fc.record({ itemId: fc.constant(itemId), grade: gradeArb, lookedUp: fc.boolean() }),
          {
            minLength: 1,
            maxLength: 3,
          },
        ),
      ),
    )
    .chain((perItem) => permutationArb(perItem.flat()));

function stepArb(catalog: Catalog): fc.Arbitrary<Step> {
  const advance = fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 3 }));
  const allItems = [...new Set(Object.values(catalog).flat())];
  return fc.oneof(
    {
      weight: 4,
      arbitrary: fc.constantFrom(...Object.keys(catalog)).chain((lessonId) =>
        fc.record({
          kind: fc.constant("lesson" as const),
          advance,
          lessonId: fc.constant(lessonId),
          outcomes: outcomesFor(catalog[lessonId]!),
          answerXp: answerXpArb,
          accuracy: accuracyArb,
        }),
      ),
    },
    {
      weight: 2,
      arbitrary: fc.subarray(allItems, { minLength: 1 }).chain((items) =>
        fc.record({
          kind: fc.constant("review" as const),
          advance,
          outcomes: outcomesFor(items),
          answerXp: answerXpArb,
          accuracy: accuracyArb,
        }),
      ),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant("placement" as const),
        advance,
        placement: fc.record({ level: levelArb, theta: thetaArb }),
      }),
    },
  );
}

/** App rule (`applyLessonResults`): worst grade per item, looked-up answers capped at 3. */
function appFinalGrades(outcomes: readonly Outcome[]): Map<string, Grade> {
  const worst = new Map<string, Grade>();
  for (const o of outcomes) {
    const grade = o.lookedUp ? (Math.min(o.grade, LOOKED_UP_MAX_GRADE) as Grade) : o.grade;
    const previous = worst.get(o.itemId);
    worst.set(o.itemId, previous === undefined ? grade : (Math.min(previous, grade) as Grade));
  }
  return worst;
}

/** App rule (`applyLessonResults`), verbatim apart from taking the grades directly. */
function appApplyLessonResults(
  worst: ReadonlyMap<string, Grade>,
  states: readonly ReviewState[],
  today: LocalDate,
): ReviewState[] {
  const byId = new Map(states.map((s) => [s.itemId, s]));
  return [...worst].map(([itemId, grade]) => {
    const existing = byId.get(itemId);
    if (existing === undefined && grade < 3) {
      return { ...initialState(itemId, today), intervalDays: 1, dueDate: addDays(today, 1) };
    }
    const current = existing ?? initialState(itemId, today);
    const notDue = compareLocalDate(current.dueDate, today) > 0;
    return notDue && grade >= 3 ? current : review(current, grade, today);
  });
}

type Oracle = {
  states: Map<string, ReviewState>;
  xp: number;
  streak: Streak;
  placement: PlacementResult | null;
};

type Run = {
  readonly expected: Oracle;
  readonly events: StoredEvent[];
  readonly postActiveDates: LocalDate[];
  readonly foldCompleted: Set<string>;
  /** XP the fold pays on top of the app: bonuses the app withheld (see README). */
  readonly bonusDivergence: number;
  readonly appOnlyBonus: number;
};

/** Replays `steps` with the app rules; from `migrateAt` on, also writes the app's events. */
function simulate(
  catalog: Catalog,
  steps: readonly Step[],
  migrateAt: number,
  baseline: boolean,
): Run {
  const oracle: Oracle = { states: new Map(), xp: 0, streak: EMPTY_STREAK, placement: null };
  const events: StoredEvent[] = [];
  const postActiveDates: LocalDate[] = [];
  const foldCompleted = new Set<string>();
  let bonusDivergence = 0;
  let appOnlyBonus = 0;
  let today = START;
  let clock = Date.UTC(2026, 9, 1);
  const meta = () => {
    clock += 1000;
    return {
      id: uuidv7(clock, (n) => new Uint8Array(n).fill(clock % 251)),
      deviceId: "A",
      localDate: today,
      occurredAt: clock,
    };
  };

  const migrate = () => {
    const known = new Set(oracle.states.keys());
    const completedLessonIds = Object.keys(catalog).filter((l) =>
      catalog[l]!.every((i) => known.has(i)),
    );
    completedLessonIds.forEach((l) => foldCompleted.add(l));
    events.push(
      baselineImported(meta(), {
        states: [...oracle.states.values()],
        xp: oracle.xp,
        streak: oracle.streak,
        placement: oracle.placement,
        completedLessonIds,
      }),
    );
  };

  steps.forEach((step, index) => {
    if (index === migrateAt && baseline) migrate();
    const emit = index >= migrateAt;
    today = addDays(today, step.advance);

    if (step.kind === "placement") {
      oracle.placement = step.placement;
      if (emit) events.push(placementCompleted(meta(), step.placement.level, step.placement.theta));
      return;
    }
    // Review sessions only ever contain items that already have a state.
    const outcomes =
      step.kind === "review"
        ? step.outcomes.filter((o) => oracle.states.has(o.itemId))
        : step.outcomes;
    const worst = appFinalGrades(outcomes);
    const itemIds = [...worst.keys()];
    const firstCompletion = itemIds.some((id) => !oracle.states.has(id));
    const appBonus =
      step.kind === "lesson" && firstCompletion ? xpForLessonCompletion(step.accuracy) : 0;
    const current = itemIds.flatMap((id) => oracle.states.get(id) ?? []);
    for (const s of appApplyLessonResults(worst, current, today)) oracle.states.set(s.itemId, s);
    oracle.xp += step.answerXp + appBonus;
    oracle.streak = recordActivity(oracle.streak, today);

    if (!emit) return;
    const sessionId = `session-${index}`;
    for (const [itemId, grade] of worst)
      events.push(itemReviewed(meta(), sessionId, itemId, grade));
    if (step.kind === "lesson") {
      events.push(lessonCompleted(meta(), sessionId, step.lessonId, step.answerXp, step.accuracy));
      const foldBonus = foldCompleted.has(step.lessonId) ? 0 : xpForLessonCompletion(step.accuracy);
      foldCompleted.add(step.lessonId);
      bonusDivergence += foldBonus - appBonus;
      if (appBonus > 0 && foldBonus !== appBonus) appOnlyBonus += 1;
    } else {
      events.push(reviewCompleted(meta(), sessionId, step.answerXp, step.accuracy));
    }
    if (!postActiveDates.includes(today)) postActiveDates.push(today);
  });
  if (migrateAt === steps.length && baseline) migrate();
  return {
    expected: oracle,
    events,
    postActiveDates,
    foldCompleted,
    bonusDivergence,
    appOnlyBonus,
  };
}

function historyArb(catalog: Catalog) {
  return fc
    .array(stepArb(catalog), { maxLength: 30 })
    .chain((steps) =>
      fc.tuple(fc.constant(steps), fc.integer({ min: 0, max: steps.length }), fc.boolean()),
    );
}

function expectFoldMatchesOracle(run: Run, events: readonly StoredEvent[]) {
  const folded = foldEvents(events);
  const { expected } = run;
  expect(folded.anomalies).toEqual([]);
  expect(folded.states).toEqual(
    [...expected.states.values()].sort((a, b) => (a.itemId < b.itemId ? -1 : 1)),
  );
  expect(folded.streak).toEqual(expected.streak);
  expect(folded.placement).toEqual(expected.placement);
  expect(folded.activeDates).toEqual(run.postActiveDates);
  expect(folded.completedLessonIds).toEqual([...run.foldCompleted].sort());
  expect(folded.xp).toBe(expected.xp + run.bonusDivergence);
}

describe("foldEvents single-device oracle (property 4)", () => {
  it("4a. equals the current app logic exactly when lessons do not share items", () => {
    fc.assert(
      fc.property(historyArb(DISJOINT), ([steps, migrateAt, withBaseline]) => {
        // Without a baseline, pre-migration progress would be lost: only fold a full log then.
        const run = simulate(DISJOINT, steps, withBaseline ? migrateAt : 0, withBaseline);
        expect(run.bonusDivergence).toBe(0);
        expectFoldMatchesOracle(run, run.events);
      }),
      { numRuns: 300 },
    );
  });

  it("4b. with shared items differs only by first-time bonuses the app withheld", () => {
    let divergentRuns = 0;
    fc.assert(
      fc.property(historyArb(SHARED), ([steps, migrateAt, withBaseline]) => {
        const run = simulate(SHARED, steps, withBaseline ? migrateAt : 0, withBaseline);
        // The fold never withholds a bonus the app paid; it only pays the ones the app missed.
        expect(run.appOnlyBonus).toBe(0);
        expect(run.bonusDivergence).toBeGreaterThanOrEqual(0);
        if (run.bonusDivergence > 0) divergentRuns++;
        expectFoldMatchesOracle(run, run.events);
      }),
      { numRuns: 300 },
    );
    expect(divergentRuns).toBeGreaterThan(0);
  });
});
