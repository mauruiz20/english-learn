import { describe, expect, it } from "vitest";
import { levenshtein } from "./levenshtein";
import { canonicalCandidates, normalizeAnswer } from "./normalize";
import { matchAnswer } from "./match-answer";

describe("levenshtein", () => {
  it.each([
    ["", "", 0],
    ["abc", "", 3],
    ["", "abc", 3],
    ["kitten", "sitting", 3],
    ["happy", "hapy", 1],
    ["same", "same", 0],
  ])("%s vs %s = %i", (a, b, expected) => {
    expect(levenshtein(a, b)).toBe(expected);
    expect(levenshtein(b, a)).toBe(expected);
  });
});

describe("normalizeAnswer", () => {
  it.each([
    ["  Hello   World  ", "hello world"],
    ["Hello world.", "hello world"],
    ["Hello world!!!", "hello world"],
    ["Are you ok?", "are you ok"],
    ["¿Are you ok?", "are you ok"],
    ['"Hello"', "hello"],
    ["I don’t know", "i don't know"],
    ["“Quoted”", "quoted"],
    ["Yes , I do .", "yes, i do"],
    ["Hello\tthere\nfriend", "hello there friend"],
    ["Café", "café"],
    ["...", ""],
    ["", ""],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeAnswer(input)).toBe(expected);
  });
});

describe("canonicalCandidates", () => {
  it.each([
    ["I don't know", ["i do not know"]],
    ["I can't swim", ["i can not swim"]],
    ["I cannot swim", ["i can not swim"]],
    ["I won't go", ["i will not go"]],
    ["She isn't here", ["she is not here"]],
    ["I'm fine", ["i am fine"]],
    ["They're here", ["they are here"]],
    ["We've won", ["we have won"]],
    ["You'll see", ["you will see"]],
  ])("expands unambiguous contractions in %j", (input, expected) => {
    expect(canonicalCandidates(input)).toEqual(expected);
  });

  it("generates is/has/possessive candidates for 's", () => {
    expect(canonicalCandidates("It's late")).toEqual(
      expect.arrayContaining(["it's late", "it is late", "it has late"]),
    );
  });

  it("generates would/had candidates for 'd", () => {
    expect(canonicalCandidates("I'd go")).toEqual(
      expect.arrayContaining(["i would go", "i had go"]),
    );
  });

  it("keeps the candidate count bounded", () => {
    const many = Array.from({ length: 20 }, () => "it's").join(" ");
    const candidates = canonicalCandidates(many);
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.length).toBeLessThanOrEqual(32);
  });
});

describe("matchAnswer: correct", () => {
  it.each([
    ["exact", "I am happy", ["I am happy"]],
    ["case and spacing", "  i AM   happy ", ["I am happy"]],
    ["final punctuation", "I am happy.", ["I am happy"]],
    ["accepted has punctuation", "I am happy", ["I am happy!"]],
    ["curly apostrophe", "I don’t know", ["I don't know"]],
    ["contraction in input", "I don't know", ["I do not know"]],
    ["contraction in accepted", "I do not know", ["I don't know"]],
    ["cannot vs can't", "I cannot swim", ["I can't swim"]],
    ["'s as is", "It is late", ["It's late"]],
    ["'s as has", "She has gone", ["She's gone"]],
    ["'s in input", "He's tall", ["He is tall"]],
    ["'d as would", "I would like tea", ["I'd like tea"]],
    ["'d as had", "I'd finished", ["I had finished"]],
    ["second accepted", "Hi", ["Hello", "Hi"]],
  ])("%s", (_label, input, accepted) => {
    expect(matchAnswer(input, accepted).verdict).toBe("correct");
  });

  it("returns the matched accepted answer as closest", () => {
    expect(matchAnswer("hi", ["Hello", "Hi!"])).toEqual({ verdict: "correct", closest: "Hi!" });
  });
});

describe("matchAnswer: almost (typo tolerance)", () => {
  it.each([
    ["one typo in a short answer", "hapy", ["happy"]],
    ["one typo in a sentence", "I am very hapy", ["I am very happy"]],
    [
      "two typos in one word of a medium answer",
      "My best freind is here",
      ["My best friend is here"],
    ],
    [
      "three typos in one word of a long answer",
      "The government announced a new enviromnet policy today",
      ["The government announced a new environment policy today"],
    ],
  ])("%s", (_label, input, accepted) => {
    expect(matchAnswer(input, accepted)).toEqual({ verdict: "almost", closest: accepted[0] });
  });
});

describe("matchAnswer: wrong", () => {
  it.each([
    ["empty input", "", ["happy"]],
    ["only punctuation", "?!", ["happy"]],
    ["too many edits for a short answer", "hppi", ["happy"]],
    ["typos in two different words", "I am vry hapy", ["I am very happy"]],
    ["short word swapped (preposition)", "I live on Madrid", ["I live in Madrid"]],
    ["article changed", "I eat a apple", ["I eat an apple"]],
    ["missing word", "I happy", ["I am happy"]],
    ["extra word", "I am am happy", ["I am happy"]],
    ["totally different", "goodbye", ["hello"]],
    ["no accepted answers", "hello", []],
  ])("%s", (_label, input, accepted) => {
    expect(matchAnswer(input, accepted).verdict).toBe("wrong");
  });

  it("reports the accepted answer with the smallest distance as closest", () => {
    expect(matchAnswer("I am hungry", ["She is sad", "I am angry"]).closest).toBe("I am angry");
  });

  it("returns an empty closest when there are no accepted answers", () => {
    expect(matchAnswer("hello", [])).toEqual({ verdict: "wrong", closest: "" });
  });

  it("still reports a closest answer for empty input", () => {
    expect(matchAnswer("", ["happy"])).toEqual({ verdict: "wrong", closest: "happy" });
  });
});
