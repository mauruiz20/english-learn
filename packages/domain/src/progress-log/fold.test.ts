import { describe, expect, it } from "vitest";
import { localDate } from "../local-date";
import { applyReview, initialState, review, type ReviewState } from "../srs";
import { EMPTY_STREAK, recordActivity } from "../streak";
import {
  answerDisputed,
  baselineImported,
  itemReviewed,
  lessonCompleted,
  placementCompleted,
  reviewCompleted,
} from "../test-support/progress-events";
import type { StoredEvent } from "./events";
import { EMPTY_PROGRESS, foldEvents } from "./fold";

const d1 = localDate("2026-10-27");
const d2 = localDate("2026-10-28");
const d3 = localDate("2026-10-29");

describe("foldEvents", () => {
  it("folds an empty log to the empty progress", () => {
    expect(foldEvents([])).toEqual(EMPTY_PROGRESS);
    expect(EMPTY_PROGRESS).toEqual({
      states: [],
      xp: 0,
      streak: EMPTY_STREAK,
      placement: null,
      activeDates: [],
      completedLessonIds: [],
      lessonResults: [],
      anomalies: [],
    });
  });

  describe("item_reviewed", () => {
    it("applies applyReview with the event's localDate, states sorted by itemId", () => {
      const result = foldEvents([
        itemReviewed({ id: "e2", localDate: d1, occurredAt: 2 }, "s1", "b", 1),
        itemReviewed({ id: "e1", localDate: d1, occurredAt: 1 }, "s1", "a", 5),
        itemReviewed({ id: "e3", localDate: d2 }, "s2", "a", 4),
      ]);
      const a1 = applyReview(undefined, "a", 5, d1);
      expect(result.states).toEqual([
        applyReview(a1, "a", 4, d2),
        applyReview(undefined, "b", 1, d1),
      ]);
    });

    it("treats a replay of a not-due item as practice", () => {
      const result = foldEvents([
        itemReviewed({ id: "e1", localDate: d1, occurredAt: 1 }, "s1", "a", 5),
        itemReviewed({ id: "e2", localDate: d1, occurredAt: 2 }, "s2", "a", 5),
      ]);
      expect(result.states).toEqual([review(initialState("a", d1), 5, d1)]);
    });

    it("keeps only the first review of an item within one session and reports the rest", () => {
      const result = foldEvents([
        itemReviewed({ id: "e1", localDate: d1, occurredAt: 1 }, "s1", "a", 5),
        itemReviewed({ id: "e2", localDate: d1, occurredAt: 2 }, "s1", "a", 1),
      ]);
      expect(result.states).toEqual([applyReview(undefined, "a", 5, d1)]);
      expect(result.anomalies).toEqual([
        { kind: "duplicate_item_review", eventId: "e2", detail: "s1/a" },
      ]);
    });
  });

  describe("session_completed and XP", () => {
    it("adds answer XP and the first-time bonus only for the first completion of a lesson", () => {
      const result = foldEvents([
        lessonCompleted({ id: "e1", localDate: d1 }, "s1", "L1", 50, 0.9),
        lessonCompleted({ id: "e2", localDate: d2 }, "s2", "L1", 40, 0.5),
        lessonCompleted({ id: "e3", localDate: d2, occurredAt: 5 }, "s3", "L2", 30, 0.5),
        reviewCompleted({ id: "e4", localDate: d3 }, "s4", 25, 1),
      ]);
      expect(result.xp).toBe(50 + 20 + 40 + 30 + 10 + 25);
      expect(result.completedLessonIds).toEqual(["L1", "L2"]);
    });

    it("keeps each lesson's best accuracy, sorted by lessonId; reviews have none", () => {
      const result = foldEvents([
        lessonCompleted({ id: "e1", localDate: d1 }, "s1", "L2", 40, 0.5),
        lessonCompleted({ id: "e2", localDate: d1, occurredAt: 5 }, "s2", "L1", 50, 5 / 6),
        lessonCompleted({ id: "e3", localDate: d2 }, "s3", "L1", 60, 1),
        lessonCompleted({ id: "e4", localDate: d3 }, "s4", "L1", 20, 2 / 6),
        reviewCompleted({ id: "e5", localDate: d3 }, "s5", 25, 1),
      ]);
      expect(result.lessonResults).toEqual([
        { lessonId: "L1", bestAccuracy: 1, completions: 3 },
        { lessonId: "L2", bestAccuracy: 0.5, completions: 1 },
      ]);
    });

    it("counts a session delivered under two event ids once in the lesson results", () => {
      const result = foldEvents([
        lessonCompleted({ id: "e1", localDate: d1 }, "s1", "L1", 50, 0.5),
        lessonCompleted({ id: "e2", localDate: d1, occurredAt: 9 }, "s1", "L1", 60, 1),
      ]);
      expect(result.lessonResults).toEqual([{ lessonId: "L1", bestAccuracy: 0.5, completions: 1 }]);
    });

    it("pays the bonus once however often a lesson is redone, even when the redo is perfect", () => {
      const result = foldEvents([
        lessonCompleted({ id: "e1", localDate: d1 }, "s1", "L1", 40, 0.5),
        lessonCompleted({ id: "e2", localDate: d1, occurredAt: 5 }, "s2", "L1", 60, 1),
        lessonCompleted({ id: "e3", localDate: d2 }, "s3", "L1", 60, 1),
      ]);
      expect(result.xp).toBe(40 + 10 + 60 + 60);
    });

    it("pays the bonus for a new lesson whose items were all learned in other lessons", () => {
      // Deliberate change from the pre-event app rule ("some item had no state yet"), which
      // withheld this bonus whenever lessons share items.
      const result = foldEvents([
        itemReviewed({ id: "e1", localDate: d1, occurredAt: 1 }, "s1", "shared", 5),
        lessonCompleted({ id: "e2", localDate: d1, occurredAt: 2 }, "s1", "L1", 10, 1),
        itemReviewed({ id: "e3", localDate: d2, occurredAt: 1 }, "s2", "shared", 5),
        lessonCompleted({ id: "e4", localDate: d2, occurredAt: 2 }, "s2", "L2", 10, 1),
      ]);
      expect(result.xp).toBe(10 + 20 + 10 + 20);
    });

    it("gives the bonus to the earliest completion in fold order, whatever the input order", () => {
      const early = lessonCompleted({ id: "e1", localDate: d1 }, "s1", "L1", 0, 0.5);
      const late = lessonCompleted({ id: "e2", localDate: d2 }, "s2", "L1", 0, 1);
      expect(foldEvents([late, early]).xp).toBe(10);
    });

    it("never pays a session twice when the same sessionId arrives under two event ids", () => {
      const result = foldEvents([
        reviewCompleted({ id: "e1", localDate: d1 }, "s1", 30, 1),
        reviewCompleted({ id: "e2", localDate: d1, occurredAt: 1 }, "s1", 30, 1),
      ]);
      expect(result.xp).toBe(30);
      expect(result.anomalies).toEqual([
        { kind: "duplicate_session", eventId: "e2", detail: "s1" },
      ]);
    });

    it("derives the streak and active dates from session dates", () => {
      const result = foldEvents([
        reviewCompleted({ id: "e3", localDate: d3 }, "s3", 0, 1),
        reviewCompleted({ id: "e1", localDate: d1 }, "s1", 0, 1),
        reviewCompleted({ id: "e2", localDate: d1, occurredAt: 9 }, "s2", 0, 1),
      ]);
      expect(result.activeDates).toEqual([d1, d3]);
      expect(result.streak).toEqual(recordActivity(recordActivity(EMPTY_STREAK, d1), d3));
    });
  });

  describe("placement_completed", () => {
    it("keeps the latest placement in fold order", () => {
      const result = foldEvents([
        placementCompleted({ id: "e2", localDate: d2 }, "B1", 0.2),
        placementCompleted({ id: "e1", localDate: d1 }, "A2", -1),
      ]);
      expect(result.placement).toEqual({ level: "B1", theta: 0.2 });
    });
  });

  describe("baseline_imported", () => {
    const known: ReviewState = { ...initialState("a", d1), reps: 2, intervalDays: 6, dueDate: d3 };

    it("seeds states, xp, streak, placement and completed lessons", () => {
      const streak = recordActivity(EMPTY_STREAK, d1);
      const result = foldEvents([
        baselineImported(
          { id: "b1", localDate: d1 },
          {
            states: [known],
            xp: 120,
            streak,
            placement: { level: "A2", theta: -0.7 },
            completedLessonIds: ["L1"],
          },
        ),
        lessonCompleted({ id: "e1", localDate: d2 }, "s1", "L1", 10, 1),
      ]);
      expect(result).toMatchObject({
        states: [known],
        xp: 130,
        streak: recordActivity(streak, d2),
        placement: { level: "A2", theta: -0.7 },
        completedLessonIds: ["L1"],
        anomalies: [],
      });
    });

    it("merges baselines from several devices", () => {
      const laterDue: ReviewState = { ...known, dueDate: localDate("2026-11-05"), reps: 1 };
      const moreReps: ReviewState = { ...known, reps: 3 };
      const result = foldEvents([
        baselineImported(
          { id: "b1", localDate: d1, deviceId: "A" },
          {
            states: [known, initialState("x", d1)],
            xp: 100,
            streak: { current: 2, longest: 9, lastActiveDate: d2 },
            placement: { level: "A2", theta: -1 },
          },
        ),
        baselineImported(
          { id: "b2", localDate: d2, deviceId: "B" },
          {
            states: [laterDue],
            xp: 40,
            streak: { current: 5, longest: 5, lastActiveDate: d3 },
            placement: null,
          },
        ),
        baselineImported(
          { id: "b3", localDate: d3, deviceId: "C" },
          {
            states: [moreReps],
            xp: 1,
            streak: EMPTY_STREAK,
            placement: { level: "B1", theta: 0.1 },
            completedLessonIds: ["L9"],
          },
        ),
      ]);
      expect(result.states).toEqual([laterDue, initialState("x", d1)]);
      expect(result.xp).toBe(141);
      expect(result.streak).toEqual({ current: 5, longest: 9, lastActiveDate: d3 });
      expect(result.placement).toEqual({ level: "B1", theta: 0.1 });
      expect(result.completedLessonIds).toEqual(["L9"]);
    });

    it("keeps the state with more reps when due dates tie", () => {
      const moreReps: ReviewState = { ...known, reps: 3 };
      const result = foldEvents([
        baselineImported(
          { id: "b1", localDate: d1 },
          { states: [moreReps], xp: 0, streak: EMPTY_STREAK, placement: null },
        ),
        baselineImported(
          { id: "b2", localDate: d2 },
          { states: [known], xp: 0, streak: EMPTY_STREAK, placement: null },
        ),
      ]);
      expect(result.states).toEqual([moreReps]);
    });

    it("applies at its position in the total order, not first", () => {
      // A review folded before the baseline is overridden only when the baseline state is later.
      const reviewed = applyReview(undefined, "a", 5, d1); // due d2
      const result = foldEvents([
        baselineImported(
          { id: "b1", localDate: d2 },
          { states: [known], xp: 0, streak: EMPTY_STREAK, placement: null },
        ),
        itemReviewed({ id: "e1", localDate: d1 }, "s1", "a", 5),
        itemReviewed({ id: "e2", localDate: d3 }, "s2", "a", 5),
      ]);
      expect(reviewed.dueDate).toBe(d2);
      // baseline (due d3) replaces the d1 review; the d3 review then reviews the baseline state.
      expect(result.states).toEqual([review(known, 5, d3)]);
    });
  });

  describe("answer_disputed", () => {
    const disputed = (id: string, payload: Record<string, unknown> = {}): StoredEvent =>
      answerDisputed({ id, localDate: d1 }, "b1.travel.write-001", ["b1.travel.although"], {
        answer: "We still made it in time.",
        ...payload,
      });

    it("is a known event that changes no progress and reports nothing", () => {
      const session = [
        itemReviewed({ id: "r1", localDate: d1 }, "s1", "b1.travel.although", 4),
        reviewCompleted({ id: "c1", localDate: d1 }, "s1", 10, 1),
      ];
      expect(foldEvents([...session, disputed("x1")])).toEqual(foldEvents(session));
      expect(foldEvents([disputed("x1")])).toEqual(EMPTY_PROGRESS);
    });

    it("reports a malformed dispute as invalid", () => {
      const tooLong = disputed("x2", { answer: "a".repeat(201) });
      const accepted = disputed("x3", { accepted: true });
      const noItems = disputed("x4", { itemIds: [] });
      expect(foldEvents([tooLong, accepted, noItems]).anomalies).toEqual([
        { kind: "invalid_event", eventId: "x2", detail: "answer_disputed payload" },
        { kind: "invalid_event", eventId: "x3", detail: "answer_disputed payload" },
        { kind: "invalid_event", eventId: "x4", detail: "answer_disputed payload" },
      ]);
    });
  });

  describe("retired wardrobe events (item_purchased, item_equipped)", () => {
    const purchase = (id: string, payload: unknown): StoredEvent => ({
      id,
      deviceId: "A",
      occurredAt: 5,
      localDate: d1,
      type: "item_purchased",
      payload,
    });
    const equip = (id: string, payload: unknown): StoredEvent => ({
      ...purchase(id, payload),
      type: "item_equipped",
    });
    const retired = [
      purchase("w1", { v: 1, itemId: "gorra", price: 80 }),
      equip("w2", { v: 1, slot: "head", itemId: "gorra" }),
      equip("w3", { v: 1, slot: "head", itemId: null }),
      // Malformed or newer copies are ignored as well: the types are retired, not validated.
      purchase("w4", { v: 2 }),
      equip("w5", null),
    ];

    it("folds a log that contains them, ignoring them without anomalies", () => {
      const progress = [
        lessonCompleted({ id: "e1", localDate: d1, occurredAt: 1 }, "s1", "L1", 30, 1),
        itemReviewed({ id: "e2", localDate: d1, occurredAt: 2 }, "s1", "a", 5),
      ];
      expect(foldEvents([...retired, ...progress])).toEqual(foldEvents(progress));
      expect(foldEvents(retired)).toEqual(EMPTY_PROGRESS);
    });
  });

  describe("dedupe and anomalies", () => {
    it("folds an event delivered twice once", () => {
      const event = reviewCompleted({ id: "e1", localDate: d1 }, "s1", 30, 1);
      expect(foldEvents([event, { ...event }])).toEqual(foldEvents([event]));
    });

    it("keeps the first of two different events sharing an id and reports the conflict", () => {
      const a = reviewCompleted({ id: "e1", localDate: d1 }, "s1", 30, 1);
      const b = reviewCompleted({ id: "e1", localDate: d2 }, "s2", 99, 1);
      const result = foldEvents([b, a]);
      expect(result.xp).toBe(30);
      expect(result.anomalies).toEqual([
        { kind: "conflicting_duplicate", eventId: "e1", detail: "" },
      ]);
    });

    it("reports a conflicting copy once even when it is delivered several times", () => {
      const a = reviewCompleted({ id: "e1", localDate: d1 }, "s1", 30, 1);
      const b = reviewCompleted({ id: "e1", localDate: d2 }, "s2", 99, 1);
      expect(foldEvents([a, b, b, { ...b }])).toEqual(foldEvents([a, b]));
    });

    it("skips unknown types and payload versions, reporting them", () => {
      const unknownType: StoredEvent = {
        id: "u1",
        deviceId: "A",
        occurredAt: 0,
        localDate: d1,
        type: "streak_frozen",
        payload: { v: 1 },
      };
      const futureVersion: StoredEvent = {
        ...reviewCompleted({ id: "u2", localDate: d1 }, "s1", 30, 1),
        payload: { v: 2, whatever: true },
      };
      const result = foldEvents([unknownType, futureVersion]);
      expect(result).toEqual({
        ...EMPTY_PROGRESS,
        anomalies: [
          { kind: "unsupported_event", eventId: "u1", detail: "streak_frozen" },
          { kind: "unsupported_event", eventId: "u2", detail: "session_completed v2" },
        ],
      });
    });

    it("skips malformed events without throwing", () => {
      const base = itemReviewed({ id: "x", localDate: d1 }, "s1", "a", 5);
      const result = foldEvents([
        { ...base, id: "bad-grade", payload: { ...base.payload, grade: 9 } },
        { ...base, id: "bad-date", localDate: "2026-02-30" },
        { ...base, id: "bad-time", occurredAt: Number.NaN },
        {
          ...lessonCompleted({ id: "bad-acc", localDate: d1 }, "s9", "L1", 10, 1),
          payload: {
            v: 1,
            sessionId: "s9",
            kind: "lesson",
            lessonId: "L1",
            answerXp: 10,
            accuracy: 2,
          },
        },
        { ...base, id: "no-payload", payload: null },
      ] as StoredEvent[]);
      expect(result.states).toEqual([]);
      expect(result.xp).toBe(0);
      expect(result.anomalies.map((a) => [a.kind, a.eventId])).toEqual([
        ["invalid_event", "bad-date"],
        ["invalid_event", "bad-time"],
        ["invalid_event", "bad-acc"],
        ["invalid_event", "bad-grade"],
        ["invalid_event", "no-payload"],
      ]);
    });
  });
});
