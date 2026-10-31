import { describe, expect, it } from "vitest";
import { checkAttribution, englishCandidates, exercisesOf, type ExerciseLike } from "./attribution";
import type { Sentence } from "./tatoeba";

const english = new Map<number, Sentence>([
  [10, { id: 10, lang: "eng", text: "I play soccer every day.", author: "CK" }],
]);
const src = { kind: "tatoeba", sentenceId: 10, author: "CK", license: "CC BY 2.0 FR" };

describe("englishCandidates", () => {
  it("rebuilds the English sentence for each exercise type", () => {
    expect(
      englishCandidates({
        type: "cloze",
        source: src,
        sentence: "I ___ soccer every day.",
        answers: ["play"],
      }),
    ).toEqual(["I play soccer every day."]);
    expect(englishCandidates({ type: "word_order", source: src, accepted: ["a", "b"] })).toEqual([
      "a",
    ]);
    expect(
      englishCandidates({ type: "translate_write", source: src, accepted: ["a", "b"] }),
    ).toEqual(["a", "b"]);
    // translate_write accepted entries are answer patterns: any sentence they stand for.
    expect(
      englishCandidates({
        type: "translate_write",
        source: src,
        accepted: ["I {like|love} it[ a lot].", "Me too."],
      }),
    ).toEqual(["I like it.", "I like it a lot.", "I love it.", "I love it a lot.", "Me too."]);
    expect(englishCandidates({ type: "translation_choice", source: src, sentence: "x" })).toEqual([
      "x",
    ]);
    expect(englishCandidates({ type: "reading", source: src })).toEqual([]);
  });
});

describe("checkAttribution", () => {
  const ok: ExerciseLike = {
    id: "a2.free-time.cloze-001",
    type: "cloze",
    source: src,
    sentence: "I ___ soccer every day.",
    answers: ["play"],
  };

  it("passes original content and correct Tatoeba quotes", () => {
    expect(checkAttribution({ ...ok, source: { kind: "original" } }, english)).toEqual([]);
    expect(checkAttribution(ok, english)).toEqual([]);
  });
  it("reports unknown ids, wrong authors and misquoted text", () => {
    expect(checkAttribution({ ...ok, source: { ...src, sentenceId: 99 } }, english)).toHaveLength(
      1,
    );
    const wrong = checkAttribution(
      { ...ok, source: { ...src, author: "someone" }, answers: ["watch"] },
      english,
    );
    expect(wrong.map((e) => e.message)).toEqual([
      'author is "someone" but #10 is owned by "CK"',
      '#10 is "I play soccer every day.", not quoted by the exercise',
    ]);
  });
});

describe("exercisesOf", () => {
  it("collects exercises and placement exercises, tagging placement ids", () => {
    const file = {
      exercises: [ok()],
      placement: [
        { id: "placement.a1.001", exercise: { type: "vocab", source: { kind: "original" } } },
      ],
    };
    expect(exercisesOf(file).map((e) => e.id)).toEqual(["x", "placement.a1.001"]);
    expect(exercisesOf(null)).toEqual([]);
  });
  function ok(): ExerciseLike {
    return { id: "x", type: "vocab", source: { kind: "original" } };
  }
});
