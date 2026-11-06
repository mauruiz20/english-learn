import { cloze, reading, translateWrite, translationChoice, vocab, wordOrder } from "./fixtures";
import { prepareExercise } from "./prepare-exercise";
import { spokenAnswer } from "./spoken-answer";

const prepared = (e: Parameters<typeof prepareExercise>[0]) => prepareExercise(e, () => 0);

describe("spokenAnswer", () => {
  it("says the English the feedback shows, as a whole sentence where there is one", () => {
    expect(spokenAnswer(prepared(wordOrder), "I usually wake up")).toBe("I usually wake up");
    expect(spokenAnswer(prepared(translateWrite), "I usually go to bed at 11.")).toBe(
      "I usually go to bed at 11.",
    );
    // The gap filled with the right answer.
    expect(spokenAnswer(prepared(cloze), "have")).toBe("I usually have breakfast at seven.");
    // The answer is Spanish: the English sentence that was translated.
    expect(spokenAnswer(prepared(translationChoice), "Ella se acuesta a las once.")).toBe(
      "She goes to bed at eleven.",
    );
  });

  it("says an English vocab answer, and nothing for a Spanish one", () => {
    expect(
      spokenAnswer(
        prepared({
          ...vocab,
          prompt: "Choose the English for 'despertarse'.",
          options: ["wake up", "go out", "get on"],
          answerIndex: 0,
        }),
        "wake up",
      ),
    ).toBe("wake up");
    expect(spokenAnswer(prepared(vocab), "despertarse")).toBeNull();
  });

  it("says nothing for reading (the passage has its own speaker)", () => {
    expect(spokenAnswer(prepared(reading), "1. At six thirty; 2. By bus")).toBeNull();
  });
});
