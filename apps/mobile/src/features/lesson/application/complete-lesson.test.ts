import { initialState, localDate, review } from "@english-learn/domain";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import type { LessonSummary } from "../model/lesson-session";
import { completeLesson } from "./complete-lesson";

const today = localDate("2026-10-29");

const summary: LessonSummary = {
  lessonId: "a2.routine.lesson-001",
  verdicts: ["correct", "wrong"],
  accuracy: 0.5,
  xpEarned: 20,
  itemOutcomes: [
    { itemId: "a", exerciseType: "vocab", verdict: "correct", responseMs: 1000 },
    { itemId: "b", exerciseType: "vocab", verdict: "wrong", responseMs: 1000 },
  ],
};

describe("completeLesson", () => {
  it("saves review states, adds XP and extends the streak", async () => {
    const repository = createFakeRepository({
      xp: 15,
      streak: { current: 2, longest: 5, lastActiveDate: localDate("2026-10-28") },
    });

    const result = await completeLesson({ repository, summary, today });

    expect(result).toEqual({
      xp: 35,
      streak: { current: 3, longest: 5, lastActiveDate: today },
    });
    const saved = repository.snapshot();
    expect(saved.xp).toBe(35);
    expect(saved.streak.current).toBe(3);
    expect(saved.states).toEqual([
      review(initialState("a", today), 5, today),
      review(initialState("b", today), 1, today),
    ]);
  });

  it("starts a streak of one day for a new learner", async () => {
    const repository = createFakeRepository();

    const { streak } = await completeLesson({ repository, summary, today });

    expect(streak).toEqual({ current: 1, longest: 1, lastActiveDate: today });
  });

  it("propagates repository failures", async () => {
    const repository = createFakeRepository();
    repository.addXp = () => Promise.reject(new Error("disk full"));

    await expect(completeLesson({ repository, summary, today })).rejects.toThrow("disk full");
  });
});
