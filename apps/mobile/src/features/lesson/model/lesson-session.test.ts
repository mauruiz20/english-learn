import { allExercises, lesson, translateWrite, vocab, wordOrder } from "./fixtures";
import type { ExerciseResponse } from "./response";
import {
  currentExercise,
  lessonSessionReducer,
  startLesson,
  type LessonSessionState,
} from "./lesson-session";

const correctResponses: readonly ExerciseResponse[] = [
  { kind: "choice", option: "despertarse" },
  { kind: "choice", option: "have" },
  { kind: "tokens", tokens: ["I", "usually", "wake", "up"] },
  { kind: "choice", option: "Ella se acuesta a las once." },
  { kind: "choices", options: ["At six thirty", "By bus"] },
  { kind: "text", text: "I usually go to bed at eleven" },
];

function play(
  state: LessonSessionState,
  responses: readonly ExerciseResponse[],
): LessonSessionState {
  return responses.reduce(
    (s, response) =>
      lessonSessionReducer(
        lessonSessionReducer(s, { type: "answer", response, responseMs: 1000 }),
        {
          type: "next",
        },
      ),
    state,
  );
}

describe("lessonSession", () => {
  it("starts on the first exercise", () => {
    const state = startLesson(lesson, allExercises);

    expect(state.status).toBe("answering");
    expect(currentExercise(state)).toBe(vocab);
    expect(state.status === "answering" && state.index).toBe(0);
  });

  it("refuses a lesson without exercises", () => {
    expect(() => startLesson(lesson, [])).toThrow(RangeError);
  });

  it("shows feedback after an answer and advances on next", () => {
    const answered = lessonSessionReducer(startLesson(lesson, allExercises), {
      type: "answer",
      response: { kind: "choice", option: "dormirse" },
      responseMs: 2000,
    });

    expect(answered).toMatchObject({
      status: "feedback",
      index: 0,
      feedback: { verdict: "wrong", correctAnswer: "despertarse" },
    });
    expect(currentExercise(answered)).toBe(vocab);

    const next = lessonSessionReducer(answered, { type: "next" });
    expect(next).toMatchObject({ status: "answering", index: 1 });
  });

  it("ignores actions that do not fit the current status", () => {
    const start = startLesson(lesson, allExercises);

    expect(lessonSessionReducer(start, { type: "next" })).toBe(start);
    const answered = lessonSessionReducer(start, {
      type: "answer",
      response: { kind: "choice", option: "despertarse" },
      responseMs: 1,
    });
    expect(
      lessonSessionReducer(answered, {
        type: "answer",
        response: { kind: "choice", option: "dormirse" },
        responseMs: 1,
      }),
    ).toBe(answered);
  });

  it("finishes with a summary after the last exercise", () => {
    const finished = play(startLesson(lesson, allExercises), correctResponses);

    expect(finished.status).toBe("finished");
    if (finished.status !== "finished") return;
    expect(currentExercise(finished)).toBeNull();
    expect(finished.summary).toMatchObject({
      lessonId: lesson.id,
      verdicts: ["correct", "correct", "correct", "correct", "correct", "correct"],
      accuracy: 1,
      // 6 × 10 XP + 20 XP completion bonus (≥ 80 %).
      xpEarned: 80,
    });
  });

  it("sums answer XP and the smaller completion bonus below 80 % accuracy", () => {
    const responses: readonly ExerciseResponse[] = [
      { kind: "choice", option: "dormirse" },
      { kind: "choice", option: "do" },
      ...correctResponses.slice(2, 5),
      { kind: "text", text: "I usualy go to bed at eleven" },
    ];

    const finished = play(startLesson(lesson, allExercises), responses);

    expect(finished.status === "finished" && finished.summary).toMatchObject({
      verdicts: ["wrong", "wrong", "correct", "correct", "correct", "almost"],
      accuracy: 0.5,
      // 3 × 10 + 5 (almost) + 10 completion bonus.
      xpEarned: 45,
    });
  });

  it("records one outcome per item of every exercise", () => {
    const finished = play(startLesson(lesson, [wordOrder, translateWrite]), [
      { kind: "tokens", tokens: ["I", "usually", "wake", "up"] },
      { kind: "text", text: "no idea" },
    ]);

    expect(finished.status === "finished" && finished.summary.itemOutcomes).toEqual([
      {
        itemId: "a2.routine.usually",
        exerciseType: "word_order",
        verdict: "correct",
        responseMs: 1000,
      },
      {
        itemId: "a2.routine.wake-up",
        exerciseType: "word_order",
        verdict: "correct",
        responseMs: 1000,
      },
      {
        itemId: "a2.routine.usually",
        exerciseType: "translate_write",
        verdict: "wrong",
        responseMs: 1000,
      },
      {
        itemId: "a2.routine.go-to-bed",
        exerciseType: "translate_write",
        verdict: "wrong",
        responseMs: 1000,
      },
    ]);
  });
});
