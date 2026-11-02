import { lessonScore } from "./lesson-score";

describe("lessonScore", () => {
  it("turns the best accuracy into right answers out of the lesson's exercises", () => {
    expect(lessonScore({ lessonId: "l", bestAccuracy: 5 / 6, completions: 1 }, 6)).toEqual({
      correct: 5,
      total: 6,
      perfect: false,
    });
    expect(lessonScore({ lessonId: "l", bestAccuracy: 0.8, completions: 2 }, 10)).toEqual({
      correct: 8,
      total: 10,
      perfect: false,
    });
  });

  it("is perfect only when every answer was right", () => {
    expect(lessonScore({ lessonId: "l", bestAccuracy: 1, completions: 3 }, 7)).toEqual({
      correct: 7,
      total: 7,
      perfect: true,
    });
    // 0.999… rounds to every exercise, but it was not all correct.
    expect(lessonScore({ lessonId: "l", bestAccuracy: 0.999, completions: 1 }, 6)?.perfect).toBe(
      false,
    );
    expect(lessonScore({ lessonId: "l", bestAccuracy: 0.999, completions: 1 }, 6)?.correct).toBe(5);
  });

  it("has no score without a result or exercises", () => {
    expect(lessonScore(undefined, 6)).toBeUndefined();
    expect(lessonScore({ lessonId: "l", bestAccuracy: 1, completions: 1 }, 0)).toBeUndefined();
  });

  it("stays within 0 and the exercise count for out-of-range accuracies", () => {
    expect(lessonScore({ lessonId: "l", bestAccuracy: 1.5, completions: 1 }, 6)?.correct).toBe(6);
    expect(lessonScore({ lessonId: "l", bestAccuracy: -1, completions: 1 }, 6)?.correct).toBe(0);
  });
});
