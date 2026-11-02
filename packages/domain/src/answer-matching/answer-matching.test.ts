import { describe, expect, it } from "vitest";
import { levenshtein } from "./levenshtein";
import { canonicalCandidates, normalizeAnswer } from "./normalize";
import { FUNCTION_WORDS, matchAnswer } from "./match-answer";
import { matchPatternAnswer } from "./pattern";

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
    expect(matchAnswer("hi", ["Hello", "Hi!"])).toMatchObject({
      verdict: "correct",
      closest: "Hi!",
    });
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
    expect(matchAnswer(input, accepted)).toMatchObject({ verdict: "almost", closest: accepted[0] });
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
    ["missing content word", "I am happy", ["I am very happy"]],
    ["extra content word", "I am really happy", ["I am happy"]],
    ["totally different", "goodbye", ["hello"]],
    ["no accepted answers", "hello", []],
  ])("%s", (_label, input, accepted) => {
    expect(matchAnswer(input, accepted).verdict).toBe("wrong");
  });

  it("reports the accepted answer with the smallest distance as closest", () => {
    expect(matchAnswer("I am hungry", ["She is sad", "I am angry"]).closest).toBe("I am angry");
  });

  it("returns an empty closest when there are no accepted answers", () => {
    expect(matchAnswer("hello", [])).toMatchObject({ verdict: "wrong", closest: "" });
  });

  it("still reports a closest answer for empty input", () => {
    expect(matchAnswer("", ["happy"])).toMatchObject({ verdict: "wrong", closest: "happy" });
  });
});

describe("matchAnswer: almost (one extra or missing function word)", () => {
  it.each([
    [
      "owner case: extra article before 'work'",
      "My commute to the work takes forty minutes",
      ["My commute to work takes forty minutes."],
    ],
    ["missing auxiliary", "I happy", ["I am happy"]],
    ["extra auxiliary", "I am am happy", ["I am happy"]],
    ["missing preposition", "I listen music every day", ["I listen to music every day."]],
    ["missing subject 'it'", "Is raining today", ["It is raining today."]],
    ["extra possessive", "She washed her the car", ["She washed the car."]],
    ["missing article, with contractions", "I'm student", ["I am a student."]],
    [
      "punctuation differences do not count",
      "My commute, to the work takes forty minutes!",
      ["My commute to work takes forty minutes."],
    ],
  ])("%s", (_label, input, accepted) => {
    expect(matchAnswer(input, accepted)).toMatchObject({ verdict: "almost", closest: accepted[0] });
  });

  it("is 'almost' through answer patterns too", () => {
    expect(
      matchPatternAnswer("My commute to the work lasts forty minutes", [
        "My commute to work {takes|lasts} forty minutes.",
      ]),
    ).toMatchObject({ verdict: "almost", closest: "My commute to work lasts forty minutes." });
  });

  it("is 'almost' for the owner's answer against the real corpus patterns", () => {
    const accepted = [
      "My commute{ to work|} {takes|takes me|is|lasts} {forty|40} minutes.",
      "It takes me {forty|40} minutes to {get|go} to work.",
    ];
    const result = matchPatternAnswer("My commute to the work takes forty minutes", accepted);
    expect(result).toMatchObject({
      verdict: "almost",
      closest: "My commute to work takes forty minutes.",
      hint: "En inglés se dice 'to work', sin 'the'.",
    });
    expect(result.diff.filter((op) => op.kind !== "same")).toEqual([
      { kind: "extra", text: "the" },
    ]);
  });

  it.each([
    ["missing negation 'not'", "I do like it", ["I do not like it"]],
    ["missing negation as a contraction", "I do like it", ["I don't like it"]],
    ["extra 'never'", "I never eat meat", ["I eat meat"]],
    ["missing 'no'", "I have time", ["I have no time"]],
    ["extra 'nothing'", "I see nothing here", ["I see here"]],
    ["missing content word", "I am happy", ["I am very happy"]],
    ["missing subject 'I' (not in the list)", "Have a dog", ["I have a dog."]],
    [
      "extra function word plus a typo elsewhere",
      "My comute to the work takes forty minutes",
      ["My commute to work takes forty minutes."],
    ],
    ["two extra function words", "I go to the the school", ["I go to school"]],
    ["one-word answer missing its article", "apple", ["an apple"]],
  ])("stays wrong: %s", (_label, input, accepted) => {
    expect(matchAnswer(input, accepted).verdict).toBe("wrong");
  });

  it("allows only the explicit list of function words, and no negations", () => {
    for (const negation of ["not", "no", "never", "nothing", "nobody", "none", "neither", "nor"]) {
      expect(FUNCTION_WORDS.has(negation)).toBe(false);
    }
    expect([...FUNCTION_WORDS].sort()).toEqual(
      [
        ...["a", "an", "the"],
        ...["to", "at", "in", "on", "of", "for", "with", "from", "by", "about"],
        ...["do", "does", "did", "is", "are", "am", "was", "were", "have", "has", "had"],
        ...["will", "would"],
        ...["my", "your", "his", "her", "its", "our", "their"],
        ...["it", "and", "that"],
      ].sort(),
    );
  });
});

describe("matchAnswer: word diff and hint", () => {
  it("returns the word diff against the closest accepted answer, and a calque hint", () => {
    const result = matchAnswer("My commute to the work takes forty minutes", [
      "My commute to work takes forty minutes.",
    ]);
    expect(result.diff.filter((op) => op.kind !== "same")).toEqual([
      { kind: "extra", text: "the" },
    ]);
    expect(result.hint).toBe("En inglés se dice 'to work', sin 'the'.");
  });

  it("has no hint and no differences for a correct answer", () => {
    const result = matchAnswer("I am happy", ["I'm happy."]);
    expect(result.diff.every((op) => op.kind === "same")).toBe(true);
    expect(result.hint).toBeUndefined();
  });
});
