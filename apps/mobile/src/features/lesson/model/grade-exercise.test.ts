import { cloze, reading, translateWrite, translationChoice, vocab, wordOrder } from "./fixtures";
import { gradeExercise } from "./grade-exercise";

describe("gradeExercise", () => {
  describe("option-based exercises", () => {
    it("grades vocab by the chosen option text", () => {
      expect(gradeExercise(vocab, { kind: "choice", option: "despertarse" })).toEqual({
        verdict: "correct",
        correctAnswer: "despertarse",
      });
      expect(gradeExercise(vocab, { kind: "choice", option: "dormirse" })).toEqual({
        verdict: "wrong",
        correctAnswer: "despertarse",
      });
    });

    it("grades translation choice", () => {
      const right = gradeExercise(translationChoice, {
        kind: "choice",
        option: "Ella se acuesta a las once.",
      });
      const wrong = gradeExercise(translationChoice, {
        kind: "choice",
        option: "Ella come a las once.",
      });

      expect(right.verdict).toBe("correct");
      expect(wrong).toEqual({ verdict: "wrong", correctAnswer: "Ella se acuesta a las once." });
    });

    it("grades cloze: the first answer is the option shown, but any answer counts", () => {
      expect(gradeExercise(cloze, { kind: "choice", option: "have" })).toEqual({
        verdict: "correct",
        correctAnswer: "have",
      });
      expect(gradeExercise(cloze, { kind: "choice", option: "eat" }).verdict).toBe("correct");
      expect(gradeExercise(cloze, { kind: "choice", option: "do" })).toEqual({
        verdict: "wrong",
        correctAnswer: "have",
      });
    });
  });

  describe("reading", () => {
    it("is correct only when every question is answered correctly", () => {
      const all = gradeExercise(reading, { kind: "choices", options: ["At six thirty", "By bus"] });
      const one = gradeExercise(reading, { kind: "choices", options: ["At six", "By bus"] });

      expect(all).toEqual({
        verdict: "correct",
        correctAnswer: "1. At six thirty; 2. By bus",
        questionVerdicts: ["correct", "correct"],
      });
      expect(one.verdict).toBe("wrong");
      expect(one.questionVerdicts).toEqual(["wrong", "correct"]);
    });

    it("treats unanswered questions as wrong", () => {
      expect(
        gradeExercise(reading, { kind: "choices", options: ["At six thirty"] }).questionVerdicts,
      ).toEqual(["correct", "wrong"]);
    });
  });

  describe("word order", () => {
    it("joins the built tokens with single spaces and matches the accepted sentences", () => {
      expect(
        gradeExercise(wordOrder, { kind: "tokens", tokens: ["I", "usually", "wake", "up"] }),
      ).toEqual({ verdict: "correct", correctAnswer: "I usually wake up" });
    });

    it("never grades word order as almost", () => {
      const result = gradeExercise(wordOrder, {
        kind: "tokens",
        tokens: ["I", "wake", "usually", "up"],
      });

      expect(result).toEqual({ verdict: "wrong", correctAnswer: "I usually wake up" });
    });
  });

  describe("translate and write", () => {
    it("accepts any accepted variant, ignoring case and final punctuation", () => {
      expect(
        gradeExercise(translateWrite, { kind: "text", text: "i usually go to bed at 11" }),
      ).toEqual({ verdict: "correct", correctAnswer: "I usually go to bed at 11." });
    });

    it("grades a single-word typo as almost and shows the closest answer", () => {
      expect(
        gradeExercise(translateWrite, { kind: "text", text: "I usualy go to bed at eleven" }),
      ).toEqual({ verdict: "almost", correctAnswer: "I usually go to bed at eleven." });
    });

    it("shows the first accepted answer when wrong", () => {
      expect(gradeExercise(translateWrite, { kind: "text", text: "I sleep" })).toEqual({
        verdict: "wrong",
        correctAnswer: "I usually go to bed at eleven.",
      });
    });
  });

  it("rejects a response that does not fit the exercise type", () => {
    expect(() => gradeExercise(vocab, { kind: "text", text: "despertarse" })).toThrow(TypeError);
  });
});
