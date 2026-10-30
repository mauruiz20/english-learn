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
      response: { kind: "choice", option: "dormirse" },
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
      // 6 × 10 XP; the completion bonus is decided when the results are saved.
      answerXp: 60,
    });
  });

  it("sums answer XP per verdict", () => {
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
      // 3 × 10 + 5 (almost).
      answerXp: 35,
    });
  });

  it("runs a session that is not a lesson (e.g. a review)", () => {
    const finished = play(startLesson({ id: "review", title: "Repaso" }, [vocab]), [
      correctResponses[0] as ExerciseResponse,
    ]);

    expect(finished.status === "finished" && finished.summary).toMatchObject({
      lessonId: "review",
      answerXp: 10,
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

  describe("word lookups", () => {
    const outcomesOf = (state: LessonSessionState) =>
      state.status === "finished" ? state.summary.itemOutcomes : [];
    const lookup = (state: LessonSessionState, itemIds: readonly string[]) =>
      lessonSessionReducer(state, { type: "lookup", itemIds });

    it("flags an item looked up before answering an exercise that practices it", () => {
      const state = lookup(startLesson(lesson, allExercises), ["a2.routine.wake-up"]);
      const finished = play(state, correctResponses);

      expect(outcomesOf(finished).filter((o) => o.lookedUp)).toEqual([
        expect.objectContaining({ itemId: "a2.routine.wake-up", exerciseType: "vocab" }),
        expect.objectContaining({ itemId: "a2.routine.wake-up", exerciseType: "word_order" }),
      ]);
    });

    it("flags later exercises when the lookup happens during an earlier feedback", () => {
      // Looked up after the vocab exercise was checked: only the word order answer is affected.
      const afterVocab = lessonSessionReducer(startLesson(lesson, allExercises), {
        type: "answer",
        response: correctResponses[0]!,
        responseMs: 1000,
      });
      const finished = play(
        lessonSessionReducer(lookup(afterVocab, ["a2.routine.wake-up"]), { type: "next" }),
        correctResponses.slice(1),
      );

      expect(outcomesOf(finished).filter((o) => o.lookedUp)).toEqual([
        expect.objectContaining({ itemId: "a2.routine.wake-up", exerciseType: "word_order" }),
      ]);
    });

    it("does not flag items that were never looked up", () => {
      const finished = play(
        lookup(startLesson(lesson, allExercises), ["somewhere.else"]),
        correctResponses,
      );

      expect(outcomesOf(finished).some((o) => o.lookedUp)).toBe(false);
    });

    it("keeps the verdicts, accuracy and XP the learner earned", () => {
      const plain = play(startLesson(lesson, allExercises), correctResponses);
      const looked = play(
        lookup(startLesson(lesson, allExercises), ["a2.routine.wake-up"]),
        correctResponses,
      );

      expect(looked.status === "finished" && looked.summary.verdicts).toEqual(
        plain.status === "finished" && plain.summary.verdicts,
      );
      expect(looked.status === "finished" && looked.summary.answerXp).toBe(
        plain.status === "finished" && plain.summary.answerXp,
      );
    });

    it("ignores an empty lookup and lookups once the session is finished", () => {
      const start = startLesson(lesson, allExercises);
      expect(lookup(start, [])).toBe(start);
      const finished = play(start, correctResponses);
      expect(lookup(finished, ["a2.routine.wake-up"])).toBe(finished);
    });
  });
});
