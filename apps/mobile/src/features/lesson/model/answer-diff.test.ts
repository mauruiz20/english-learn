import { diffWords } from "./answer-diff";

describe("diffWords", () => {
  it("marks only the misspelled word of an almost-right answer", () => {
    expect(diffWords("I usualy go to bed at eleven", "I usually go to bed at eleven.")).toEqual([
      { text: "I", differs: false },
      { text: "usualy", differs: true },
      { text: "go to bed at eleven", differs: false },
    ]);
  });

  it("ignores case and punctuation", () => {
    expect(diffWords("i GO home.", "I go home")).toEqual([{ text: "i GO home.", differs: false }]);
  });

  it("marks extra words and keeps words in order", () => {
    expect(diffWords("She go to the school", "She goes to school")).toEqual([
      { text: "She", differs: false },
      { text: "go", differs: true },
      { text: "to", differs: false },
      { text: "the", differs: true },
      { text: "school", differs: false },
    ]);
  });

  it("marks everything when nothing matches, and nothing for an empty answer", () => {
    expect(diffWords("hello there", "goodbye")).toEqual([{ text: "hello there", differs: true }]);
    expect(diffWords("  ", "goodbye")).toEqual([]);
  });
});
