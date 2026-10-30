import { initialState, localDate, review } from "@english-learn/domain";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import type { LessonSummary } from "../model/lesson-session";
import { completeSession } from "./complete-session";

const today = localDate("2026-10-29");

const summary: LessonSummary = {
  lessonId: "a2.routine.lesson-001",
  verdicts: ["correct", "wrong"],
  accuracy: 0.5,
  answerXp: 10,
  itemOutcomes: [
    { itemId: "a", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
    { itemId: "b", exerciseType: "vocab", verdict: "wrong", responseMs: 1000 },
  ],
};

describe("completeSession", () => {
  it("saves review states, adds answer XP plus the lesson bonus and extends the streak", async () => {
    const repository = createFakeRepository({
      xp: 15,
      streak: { current: 2, longest: 5, lastActiveDate: localDate("2026-10-28") },
    });

    const result = await completeSession({ repository, summary, today, bonus: "lesson" });

    // 10 answer XP + 10 completion bonus (accuracy < 80 %).
    expect(result).toEqual({
      xp: 35,
      xpEarned: 20,
      streak: { current: 3, longest: 5, lastActiveDate: today },
    });
    const saved = repository.snapshot();
    expect(saved.xp).toBe(35);
    expect(saved.streak.current).toBe(3);
    expect(saved.states).toEqual([
      review(initialState("a", today), 5, today),
      // New and missed: starts fresh tomorrow, not as a lapse.
      { ...initialState("b", today), intervalDays: 1, dueDate: localDate("2026-10-30") },
    ]);
  });

  it("gives no completion bonus when replaying a lesson whose items were all learned", async () => {
    const learned = [
      review(initialState("a", today), 5, today),
      review(initialState("b", today), 5, today),
    ];
    const repository = createFakeRepository({ states: learned });

    const result = await completeSession({ repository, summary, today, bonus: "lesson" });

    expect(result.xpEarned).toBe(10);
    // Practice of non-due items: "a" (correct) keeps its schedule, "b" (wrong) lapses.
    const states = repository.snapshot().states;
    expect(states.find((s) => s.itemId === "a")).toEqual(learned[0]);
    expect(states.find((s) => s.itemId === "b")?.lapses).toBe(1);
  });

  it("never adds a completion bonus to a review", async () => {
    const repository = createFakeRepository();

    const result = await completeSession({ repository, summary, today, bonus: "none" });

    expect(result.xpEarned).toBe(10);
  });

  it("starts a streak of one day for a new learner", async () => {
    const repository = createFakeRepository();

    const { streak } = await completeSession({ repository, summary, today, bonus: "lesson" });

    expect(streak).toEqual({ current: 1, longest: 1, lastActiveDate: today });
  });

  it("propagates repository failures", async () => {
    const repository = createFakeRepository();
    repository.saveSessionResults = () => Promise.reject(new Error("disk full"));

    await expect(completeSession({ repository, summary, today, bonus: "lesson" })).rejects.toThrow(
      "disk full",
    );
  });
});
