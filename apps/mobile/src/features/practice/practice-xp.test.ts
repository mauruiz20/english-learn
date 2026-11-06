import { corpus } from "@english-learn/content/corpus";
import { localDate } from "@english-learn/domain";
import { completeSession } from "@/features/lesson/application/complete-session";
import { lessonExercises } from "@/features/lesson/model/lesson-catalog";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { testRandomBytes } from "@/testing/random-bytes";

const lesson = corpus.practiceLessonsById.get("a2.phrasal-verbs.practice-home-1")!;
const exercises = lessonExercises(lesson, corpus.exercisesById);

/** Saves the practice lesson like the lesson screen does, with `accuracy`. */
function save(
  repository: ReturnType<typeof createFakeRepository>,
  accuracy: number,
  nowMs: number,
) {
  const correct = Math.round(accuracy * exercises.length);
  return completeSession({
    repository,
    today: localDate("2030-01-01"),
    nowMs,
    randomBytes: testRandomBytes,
    deviceId: "test-device",
    kind: "lesson",
    summary: {
      lessonId: lesson.id,
      verdicts: exercises.map((_, i) => (i < correct ? "correct" : "wrong")),
      accuracy,
      answerXp: correct * 10,
      itemOutcomes: exercises.flatMap((e, i) =>
        e.itemIds.map((itemId) => ({
          itemId,
          exerciseType: e.type,
          verdict: i < correct ? ("correct" as const) : ("wrong" as const),
          responseMs: 1000,
        })),
      ),
    },
  });
}

describe("a practice lesson's XP (the bonus once per lesson id, like any lesson)", () => {
  it("pays the first completion's bonus, then only answer XP, perfect or not", async () => {
    const repository = createFakeRepository();

    const first = await save(repository, (exercises.length - 1) / exercises.length, 1);
    expect(first.xpEarned).toBeGreaterThan((exercises.length - 1) * 10);

    const perfect = await save(repository, 1, 2);
    expect(perfect.xpEarned).toBe(exercises.length * 10);

    const redo = await save(repository, 1, 3);
    expect(redo.xpEarned).toBe(exercises.length * 10);

    expect(await repository.getLessonResults()).toEqual([
      { lessonId: lesson.id, bestAccuracy: 1, completions: 3 },
    ]);
  });
});
