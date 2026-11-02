import { describe, expect, it } from "vitest";
import { calqueHint } from "./calque-hints";
import { diffAnswer } from "./word-diff";

const hintFor = (input: string, expected: string) => calqueHint(diffAnswer(input, expected));

describe("calqueHint: 'the' before nouns that go without it", () => {
  it.each([
    [
      "My commute to the work takes forty minutes",
      "My commute to work takes forty minutes.",
      "En inglés se dice 'to work', sin 'the'.",
    ],
    [
      "I go to the bed at eleven",
      "I go to bed at eleven.",
      "En inglés se dice 'to bed', sin 'the'.",
    ],
    ["She is at the home", "She is at home.", "En inglés se dice 'at home', sin 'the'."],
    [
      "We go to the church on Sundays",
      "We go to church on Sundays.",
      "En inglés se dice 'to church', sin 'the'.",
    ],
    [
      "He studies at the university",
      "He studies at university.",
      "En inglés se dice 'at university', sin 'the'.",
    ],
    ["I go the home", "I go home.", "En inglés se dice 'go home', sin 'the'."],
    [
      "The school starts at nine",
      "School starts at nine.",
      "En inglés se dice 'school', sin 'the'.",
    ],
  ])("%s", (input, expected, hint) => {
    expect(hintFor(input, expected)).toBe(hint);
  });

  it.each([
    [
      "We have the lunch at two",
      "We have lunch at two.",
      "Con las comidas no se usa 'the': se dice 'have lunch'.",
    ],
    [
      "I skip the breakfast",
      "I skip breakfast.",
      "Con las comidas no se usa 'the': se dice 'skip breakfast'.",
    ],
    [
      "The dinner is ready",
      "Dinner is ready.",
      "Con las comidas no se usa 'the': se dice 'dinner'.",
    ],
  ])("meals: %s", (input, expected, hint) => {
    expect(hintFor(input, expected)).toBe(hint);
  });

  it("says nothing for 'the' before other nouns, or a 'the' that is expected", () => {
    expect(hintFor("I like the music", "I like music.")).toBeUndefined();
    expect(hintFor("I go to the work", "I go to the work.")).toBeUndefined();
  });
});

describe("calqueHint: missing subject pronoun", () => {
  it.each([
    ["Is raining", "It is raining.", "En inglés el sujeto es obligatorio: 'It is…'."],
    ["Have a dog", "I have a dog.", "En inglés el sujeto es obligatorio: 'I have…'."],
    [
      "I like it because is fun",
      "I like it because it is fun.",
      "En inglés el sujeto es obligatorio: 'It is…'.",
    ],
    ["Are tired", "They are tired.", "En inglés el sujeto es obligatorio: 'They are…'."],
  ])("%s", (input, expected, hint) => {
    expect(hintFor(input, expected)).toBe(hint);
  });

  it("says nothing for a pronoun missing elsewhere (an object)", () => {
    expect(hintFor("I like", "I like it.")).toBeUndefined();
  });

  it("says nothing when there is no difference", () => {
    expect(hintFor("It is raining", "It is raining.")).toBeUndefined();
  });
});
