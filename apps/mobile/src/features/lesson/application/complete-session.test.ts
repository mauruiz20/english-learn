import {
  applyReview,
  foldEvents,
  initialState,
  localDate,
  review,
  type ItemReviewedEvent,
  type SessionCompletedEvent,
} from "@english-learn/domain";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createTestRandomBytes } from "@/testing/random-bytes";
import type { LessonSummary } from "../model/lesson-session";
import { completeSession, type CompleteSessionInput } from "./complete-session";

const today = localDate("2026-10-29");
const NOW = Date.UTC(2026, 9, 29, 18);
// One source for the whole file: event ids must stay unique across saves.
const randomBytes = createTestRandomBytes();

const summary: LessonSummary = {
  lessonId: "a2.routine.lesson-001",
  verdicts: ["correct", "wrong", "correct"],
  accuracy: 2 / 3,
  answerXp: 20,
  itemOutcomes: [
    { itemId: "a", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
    { itemId: "b", exerciseType: "vocab", verdict: "wrong", responseMs: 1000 },
    { itemId: "a", exerciseType: "cloze", verdict: "correct", responseMs: 1000, lookedUp: true },
  ],
};

function input(
  repository: CompleteSessionInput["repository"],
  overrides: Partial<CompleteSessionInput> = {},
): CompleteSessionInput {
  return {
    repository,
    summary,
    today,
    nowMs: NOW,
    randomBytes,
    deviceId: "test-device",
    kind: "lesson",
    ...overrides,
  };
}

describe("completeSession", () => {
  it("appends one item_reviewed per item with its final grade and one session_completed", async () => {
    const repository = createFakeRepository();

    await completeSession(input(repository));

    const events = repository.events();
    const reviews = events.filter((e): e is ItemReviewedEvent => e.type === "item_reviewed");
    const sessions = events.filter(
      (e): e is SessionCompletedEvent => e.type === "session_completed",
    );
    // "a": worst of 5 and the looked-up cap (3); "b": wrong (1).
    expect(reviews.map((e) => [e.payload.itemId, e.payload.grade])).toEqual([
      ["a", 3],
      ["b", 1],
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.payload).toEqual({
      v: 1,
      sessionId: reviews[0]?.payload.sessionId,
      kind: "lesson",
      lessonId: "a2.routine.lesson-001",
      answerXp: 20,
      accuracy: 2 / 3,
    });
    for (const event of events) {
      expect(event).toMatchObject({ deviceId: "test-device", occurredAt: NOW, localDate: today });
    }
    expect(new Set(reviews.map((e) => e.payload.sessionId)).size).toBe(1);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it("reports the XP and streak the fold produces, including the first-completion bonus", async () => {
    const repository = createFakeRepository({
      xp: 15,
      streak: { current: 2, longest: 5, lastActiveDate: localDate("2026-10-28") },
    });

    const result = await completeSession(input(repository));

    // 20 answer XP + 10 completion bonus (accuracy < 80 %).
    expect(result).toEqual({
      xp: 45,
      xpEarned: 30,
      streak: { current: 3, longest: 5, lastActiveDate: today },
      streakIncreased: true,
    });
    const progress = foldEvents(repository.events());
    expect(progress.xp).toBe(result.xp);
    expect(progress.streak).toEqual(result.streak);
    expect(repository.snapshot().states).toEqual([
      review(initialState("a", today), 3, today),
      // New and missed: starts fresh tomorrow, not as a lapse (decided by the fold).
      { ...initialState("b", today), intervalDays: 1, dueDate: localDate("2026-10-30") },
    ]);
  });

  it("pays the bonus only on the first completion of a lesson", async () => {
    const repository = createFakeRepository();

    const first = await completeSession(input(repository));
    const replay = await completeSession(input(repository));

    expect(first.xpEarned).toBe(30);
    expect(replay.xpEarned).toBe(20);
  });

  it("pays the bonus for a lesson first completed after its items were learned elsewhere", async () => {
    // The documented change from the pre-event rule: the bonus follows the lessonId.
    const learned = ["a", "b"].map((id) => review(initialState(id, today), 5, today));
    const repository = createFakeRepository({ states: learned });

    const result = await completeSession(input(repository));

    expect(result.xpEarned).toBe(30);
  });

  it("gives no bonus for a lesson completed before the event log (baseline)", async () => {
    const learned = ["a", "b"].map((id) => review(initialState(id, today), 5, today));
    const repository = createFakeRepository({
      states: learned,
      completedLessonIds: ["a2.routine.lesson-001"],
    });

    const result = await completeSession(input(repository));

    expect(result.xpEarned).toBe(20);
    // Practice of non-due items (fold rule): "a" passes and keeps its schedule, "b" lapses.
    const states = repository.snapshot().states;
    expect(states.find((s) => s.itemId === "a")).toEqual(learned[0]);
    expect(states.find((s) => s.itemId === "b")).toEqual(applyReview(learned[1], "b", 1, today));
  });

  it("writes a review session without lessonId and never adds a bonus", async () => {
    const repository = createFakeRepository();

    const result = await completeSession(input(repository, { kind: "review" }));

    expect(result.xpEarned).toBe(20);
    const session = repository.events().find((e) => e.type === "session_completed");
    expect(session?.payload).toEqual(expect.objectContaining({ kind: "review" }));
    expect(session?.payload).not.toHaveProperty("lessonId");
  });

  it("reports that the streak did not grow on a second session the same day", async () => {
    const repository = createFakeRepository({
      streak: { current: 3, longest: 5, lastActiveDate: today },
    });

    const result = await completeSession(input(repository, { kind: "review" }));

    expect(result.streak.current).toBe(3);
    expect(result.streakIncreased).toBe(false);
  });

  it("starts a streak of one day for a new learner", async () => {
    const { streak } = await completeSession(input(createFakeRepository()));

    expect(streak).toEqual({ current: 1, longest: 1, lastActiveDate: today });
  });

  it("starts its single write right away, so reads issued meanwhile wait for it", () => {
    // `awaitPendingWrites` only knows about a save once `appendEvents` is called: nothing async
    // may run before it (e.g. browser back mid-save, then home reads).
    const repository = createFakeRepository();
    const append = jest.spyOn(repository, "appendEvents");

    const saving = completeSession(input(repository));

    expect(append).toHaveBeenCalledTimes(1);
    return saving;
  });

  it("propagates repository failures", async () => {
    const repository = createFakeRepository();
    repository.appendEvents = () => Promise.reject(new Error("disk full"));

    await expect(completeSession(input(repository))).rejects.toThrow("disk full");
  });
});
