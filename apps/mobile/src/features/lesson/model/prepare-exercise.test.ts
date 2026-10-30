import {
  cloze,
  reading,
  translateWrite,
  translationChoice,
  vocab,
  wordOrder,
  sequenceRng,
} from "./fixtures";
import { prepareExercise } from "./prepare-exercise";

const rng = () => sequenceRng([0.1, 0.7, 0.3, 0.9, 0.5]);

describe("prepareExercise", () => {
  it("shuffles vocab and translation choice options, keeping every option", () => {
    const prepared = prepareExercise(vocab, rng());
    const choice = prepareExercise(translationChoice, rng());

    expect(prepared.type).toBe("vocab");
    if (prepared.type !== "vocab") return;
    expect([...prepared.options].sort()).toEqual([...vocab.options].sort());
    expect(prepared.options).not.toEqual(vocab.options);
    expect(choice.type === "translation_choice" && [...choice.options].sort()).toEqual(
      [...translationChoice.options].sort(),
    );
  });

  it("offers the first cloze answer among the shuffled distractors", () => {
    const prepared = prepareExercise(cloze, rng());

    expect(prepared.type === "cloze" && [...prepared.options].sort()).toEqual(["do", "go", "have"]);
  });

  it("scrambles word-order tokens", () => {
    const prepared = prepareExercise(wordOrder, rng());

    expect(prepared.type === "word_order" && [...prepared.tokens].sort()).toEqual(
      [...wordOrder.tokens].sort(),
    );
    expect(prepared.type === "word_order" && prepared.tokens).not.toEqual(wordOrder.tokens);
  });

  it("shuffles the options of every reading question", () => {
    const prepared = prepareExercise(reading, rng());

    expect(prepared.type).toBe("reading");
    if (prepared.type !== "reading") return;
    expect(prepared.questions.map((q) => q.prompt)).toEqual(reading.questions.map((q) => q.prompt));
    prepared.questions.forEach((q, i) => {
      expect([...q.options].sort()).toEqual([...(reading.questions[i]?.options ?? [])].sort());
    });
  });

  it("passes translate-and-write through unchanged", () => {
    expect(prepareExercise(translateWrite, rng())).toEqual({
      type: "translate_write",
      exercise: translateWrite,
    });
  });

  it("is deterministic for the same rng sequence", () => {
    expect(prepareExercise(vocab, rng())).toEqual(prepareExercise(vocab, rng()));
  });
});
