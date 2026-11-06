import fc from "fast-check";
import { LEVELS } from "../cefr";
import { addDays, localDate, type LocalDate } from "../local-date";
import type { StoredEvent } from "../progress-log/events";
import type { Grade, ReviewState } from "../srs";
import { EMPTY_STREAK, type Streak } from "../streak";
import {
  baselineImported,
  itemReviewed,
  lessonCompleted,
  placementCompleted,
  retiredWardrobeEvent,
  reviewCompleted,
  type Meta,
} from "./progress-events";

export const START = localDate("2026-10-01");

export const dateArb: fc.Arbitrary<LocalDate> = fc
  .integer({ min: 0, max: 30 })
  .map((n) => addDays(START, n));
export const gradeArb = fc.integer({ min: 0, max: 5 }) as fc.Arbitrary<Grade>;
export const itemIdArb = fc.constantFrom("i0", "i1", "i2", "i3", "i4", "i5");
export const lessonIdArb = fc.constantFrom("L0", "L1", "L2", "L3");
export const sessionIdArb = fc.constantFrom("s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7");
export const levelArb = fc.constantFrom(...LEVELS);
export const thetaArb = fc.double({ min: -4, max: 4, noNaN: true });
export const accuracyArb = fc.integer({ min: 0, max: 20 }).map((n) => n / 20);
export const answerXpArb = fc.integer({ min: 0, max: 200 });
/** Exercises answered in a session; absent as an older app wrote it. */
export const exercisesArb = fc.option(fc.integer({ min: 0, max: 40 }), { nil: undefined });

export const reviewStateArb: fc.Arbitrary<ReviewState> = fc.record({
  itemId: itemIdArb,
  ease: fc.double({ min: 1.3, max: 3, noNaN: true }),
  intervalDays: fc.integer({ min: 0, max: 60 }),
  reps: fc.integer({ min: 0, max: 10 }),
  lapses: fc.integer({ min: 0, max: 5 }),
  dueDate: dateArb,
});

export const streakArb: fc.Arbitrary<Streak> = fc.oneof(
  fc.constant(EMPTY_STREAK),
  fc
    .record({ current: fc.integer({ min: 1, max: 10 }), extra: fc.integer({ min: 0, max: 10 }) })
    .chain(({ current, extra }) =>
      dateArb.map((lastActiveDate) => ({ current, longest: current + extra, lastActiveDate })),
    ),
);

/** Envelope without id: ids are assigned afterwards so they are unique per logical event. */
type Body = (meta: Meta) => StoredEvent;

const bodyArb: fc.Arbitrary<Body> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.tuple(sessionIdArb, itemIdArb, gradeArb).map(
      ([s, i, g]) =>
        (m: Meta) =>
          itemReviewed(m, s, i, g),
    ),
  },
  {
    weight: 3,
    arbitrary: fc.tuple(sessionIdArb, lessonIdArb, answerXpArb, accuracyArb, exercisesArb).map(
      ([s, l, xp, acc, n]) =>
        (m: Meta) =>
          lessonCompleted(m, s, l, xp, acc, n),
    ),
  },
  {
    weight: 2,
    arbitrary: fc.tuple(sessionIdArb, answerXpArb, accuracyArb, exercisesArb).map(
      ([s, xp, acc, n]) =>
        (m: Meta) =>
          reviewCompleted(m, s, xp, acc, n),
    ),
  },
  {
    weight: 1,
    arbitrary: fc.tuple(levelArb, thetaArb).map(
      ([l, t]) =>
        (m: Meta) =>
          placementCompleted(m, l, t),
    ),
  },
  {
    weight: 1,
    arbitrary: fc
      .record({
        states: fc.uniqueArray(reviewStateArb, { selector: (s) => s.itemId, maxLength: 4 }),
        xp: fc.integer({ min: 0, max: 500 }),
        streak: streakArb,
        placement: fc.option(fc.record({ level: levelArb, theta: thetaArb }), { nil: null }),
        completedLessonIds: fc.uniqueArray(lessonIdArb, { maxLength: 2 }),
      })
      .map((payload) => (m: Meta) => baselineImported(m, payload)),
  },
  {
    // Retired types an older app wrote (Avi's withdrawn wardrobe): the fold ignores them.
    weight: 1,
    arbitrary: fc
      .tuple(
        fc.constantFrom("item_purchased" as const, "item_equipped" as const),
        fc.constantFrom<unknown>(
          { v: 1, itemId: "gorra", price: 80 },
          { v: 1, slot: "head", itemId: null },
          { v: 2 },
        ),
      )
      .map(
        ([type, payload]) =>
          (m: Meta) =>
            retiredWardrobeEvent(m, type, payload),
      ),
  },
  {
    // Forward compatibility: a newer app's event type or payload version.
    weight: 1,
    arbitrary: fc.constantFrom("streak_frozen", "session_completed").map(
      (type) => (m: Meta) =>
        ({
          id: m.id,
          deviceId: m.deviceId ?? "device-a",
          occurredAt: m.occurredAt ?? 0,
          localDate: m.localDate,
          type,
          payload: { v: 2 },
        }) satisfies StoredEvent,
    ),
  },
);

/**
 * Events of one device. Ids are unique (`<prefix>-<n>`); occurredAt is drawn from a tiny range so
 * that `(localDate, occurredAt)` ties are frequent and the id tie-break is exercised.
 */
export function deviceEventsArb(deviceId: string, maxLength = 25): fc.Arbitrary<StoredEvent[]> {
  return fc
    .array(fc.tuple(bodyArb, dateArb, fc.integer({ min: 0, max: 3 })), { maxLength })
    .map((rows) =>
      rows.map(([body, date, occurredAt], n) =>
        body({ id: `${deviceId}-${n}`, deviceId, localDate: date, occurredAt }),
      ),
    );
}

/** Events with a few id collisions carrying different content (corrupt or buggy writers). */
export const eventsWithConflictsArb: fc.Arbitrary<StoredEvent[]> = fc
  .tuple(deviceEventsArb("A"), fc.array(fc.tuple(bodyArb, dateArb, fc.nat(9)), { maxLength: 3 }))
  .map(([events, collisions]) => [
    ...events,
    ...collisions.map(([body, date, n]) =>
      body({ id: `A-${n}`, deviceId: "Z", localDate: date, occurredAt: 1 }),
    ),
  ]);

/** A permutation of `items` (every element exactly once). */
export function permutationArb<T>(items: readonly T[]): fc.Arbitrary<T[]> {
  return fc.shuffledSubarray([...items], { minLength: items.length, maxLength: items.length });
}

/**
 * A dense study history: many sessions over a few weeks, mostly on consecutive days, with
 * frequent perfect pages and reviews of items that are due: same-day sessions, consecutive days
 * and redone lessons all occur. One device; ids `<deviceId>-<n>`.
 */
export function studyHistoryArb(deviceId = "A", maxSessions = 40): fc.Arbitrary<StoredEvent[]> {
  const sessionArb = fc.record({
    gap: fc.constantFrom(0, 0, 0, 1, 1, 1, 2),
    kind: fc.constantFrom("lesson", "lesson", "review"),
    lessonId: fc.constantFrom("L0", "L1", "L2", "L3", "card-1"),
    accuracy: fc.constantFrom(0.5, 0.8, 1, 1),
    answerXp: answerXpArb,
    reviews: fc.uniqueArray(fc.tuple(itemIdArb, gradeArb), {
      selector: ([itemId]) => itemId,
      maxLength: 5,
    }),
  });
  return fc.array(sessionArb, { maxLength: maxSessions }).map((sessions) => {
    const events: StoredEvent[] = [];
    let date = START;
    let n = 0;
    sessions.forEach((s, k) => {
      date = addDays(date, s.gap);
      const meta = () => ({ id: `${deviceId}-${n}`, deviceId, localDate: date, occurredAt: n++ });
      const sessionId = `${deviceId}-session-${k}`;
      for (const [itemId, grade] of s.reviews) {
        events.push(itemReviewed(meta(), sessionId, itemId, grade));
      }
      events.push(
        s.kind === "lesson"
          ? lessonCompleted(meta(), sessionId, s.lessonId, s.answerXp, s.accuracy)
          : reviewCompleted(meta(), sessionId, s.answerXp, s.accuracy),
      );
    });
    return events;
  });
}
