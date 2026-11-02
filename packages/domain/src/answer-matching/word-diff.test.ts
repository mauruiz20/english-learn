import { describe, expect, it } from "vitest";
import { diffAnswer, type WordDiffOp } from "./word-diff";

const same = (text: string): WordDiffOp => ({ kind: "same", text });
const extra = (text: string): WordDiffOp => ({ kind: "extra", text });
const missing = (expected: string): WordDiffOp => ({ kind: "missing", expected });
const changed = (text: string, expected: string): WordDiffOp => ({
  kind: "changed",
  text,
  expected,
});

describe("diffAnswer", () => {
  it("reports an extra word, keeping the learner's original spelling", () => {
    expect(
      diffAnswer(
        "My commute to the work takes forty minutes",
        "My commute to work takes forty minutes.",
      ),
    ).toEqual([
      same("My"),
      same("commute"),
      same("to"),
      extra("the"),
      same("work"),
      same("takes"),
      same("forty"),
      same("minutes"),
    ]);
  });

  it("reports a missing word with the expected spelling", () => {
    expect(diffAnswer("I happy.", "I am happy.")).toEqual([
      same("I"),
      missing("am"),
      same("happy."),
    ]);
  });

  it("merges consecutive missing words into one insertion", () => {
    expect(diffAnswer("I go school", "I go to the school")).toEqual([
      same("I"),
      same("go"),
      missing("to the"),
      same("school"),
    ]);
  });

  it("reports a substituted word as changed", () => {
    expect(diffAnswer("I live on Madrid", "I live in Madrid")).toEqual([
      same("I"),
      same("live"),
      changed("on", "in"),
      same("Madrid"),
    ]);
  });

  it("reports a swap of two words as two changes", () => {
    expect(diffAnswer("I like very it", "I like it very")).toEqual([
      same("I"),
      same("like"),
      changed("very", "it"),
      changed("it", "very"),
    ]);
  });

  it("produces no differences for case or punctuation only", () => {
    expect(diffAnswer("i GO home, now!", "I go home now.")).toEqual([
      same("i"),
      same("GO"),
      same("home,"),
      same("now!"),
    ]);
  });

  it("keeps punctuation-only tokens as unchanged text", () => {
    expect(diffAnswer("Well - yes", "Well yes")).toEqual([same("Well"), same("-"), same("yes")]);
  });

  it("compares contractions by their expanded reading", () => {
    expect(diffAnswer("I don't like it", "I do not like it")).toEqual([
      same("I"),
      same("don't"),
      same("like"),
      same("it"),
    ]);
    expect(diffAnswer("I don't know", "I do know")).toEqual([
      same("I"),
      changed("don't", "do"),
      same("know"),
    ]);
  });

  it("picks the reading of an ambiguous contraction that fits best", () => {
    expect(diffAnswer("It's raining", "It is raining")).toEqual([same("It's"), same("raining")]);
    expect(diffAnswer("She's got a cat", "She has got a cat")).toEqual([
      same("She's"),
      same("got"),
      same("a"),
      same("cat"),
    ]);
  });

  it("marks every word of an empty or unrelated answer", () => {
    expect(diffAnswer("", "hello")).toEqual([missing("hello")]);
    expect(diffAnswer("goodbye", "")).toEqual([extra("goodbye")]);
  });
});
