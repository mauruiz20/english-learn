import { describe, expect, it } from "vitest";
import {
  MAX_PATTERN_EXPANSIONS,
  expandAccepted,
  expandPattern,
  isPattern,
  matchPatternAnswer,
} from "./pattern";

const expand = (pattern: string, limit?: number) => {
  const result = expandPattern(pattern, limit);
  if (!result.ok) throw new Error(result.error);
  return result.expansions;
};
const errorOf = (pattern: string, limit?: number) => {
  const result = expandPattern(pattern, limit);
  if (result.ok) throw new Error(`expected an error for ${pattern}`);
  return result.error;
};

describe("expandPattern", () => {
  it("keeps plain text as is", () => {
    expect(expand("I am happy.")).toEqual(["I am happy."]);
  });

  it("expands alternatives in order", () => {
    expect(expand("I {like|love} it.")).toEqual(["I like it.", "I love it."]);
  });

  it("expands optional parts, the shorter reading first", () => {
    expect(expand("I [really ]like it.")).toEqual(["I like it.", "I really like it."]);
  });

  it("optional alternatives: none or one of them", () => {
    expect(expand("Thanks[ a lot| so much].")).toEqual([
      "Thanks.",
      "Thanks a lot.",
      "Thanks so much.",
    ]);
  });

  it("multiplies independent groups", () => {
    expect(expand("{I|We} {walk|run}")).toEqual(["I walk", "I run", "We walk", "We run"]);
  });

  it("nests alternatives inside optional parts and vice versa", () => {
    expect(expand("I [{usually|often} ]get up {early|at six[ o'clock]}.")).toEqual([
      "I get up early.",
      "I get up at six.",
      "I get up at six o'clock.",
      "I usually get up early.",
      "I usually get up at six.",
      "I usually get up at six o'clock.",
      "I often get up early.",
      "I often get up at six.",
      "I often get up at six o'clock.",
    ]);
  });

  it("allows an empty alternative for an optional word", () => {
    expect(expand("It is {very |}cold.")).toEqual(["It is very cold.", "It is cold."]);
  });

  it("normalizes whitespace: collapses runs, trims, no space before punctuation", () => {
    expect(expand("I like it [very much] .")).toEqual(["I like it.", "I like it very much."]);
    expect(expand(" [Well,] I  agree ")).toEqual(["I agree", "Well, I agree"]);
  });

  it("removes duplicate expansions", () => {
    expect(expand("{a|a} b")).toEqual(["a b"]);
  });

  it("escapes the special characters with a backslash", () => {
    expect(expand(String.raw`a \{b\} \[c\] d\|e \\ f`)).toEqual([String.raw`a {b} [c] d|e \ f`]);
  });

  it.each([
    ["I {like it", "unclosed"],
    ["I like} it", "unexpected"],
    ["I [like it", "unclosed"],
    ["I like] it", "unexpected"],
    ["I {like]", "unexpected"],
    ["I like|love it", "outside"],
    ["I {} it", "empty"],
    ["I [] it", "empty"],
    ["trailing \\", "escape"],
  ])("rejects %j (%s)", (pattern, fragment) => {
    expect(errorOf(pattern)).toContain(fragment);
  });

  it("caps the number of expansions", () => {
    const pattern = Array.from({ length: 11 }, () => "{a|b}").join(" ");
    expect(errorOf(pattern)).toContain(`more than ${MAX_PATTERN_EXPANSIONS}`);
    expect(expand(pattern, 4096)).toHaveLength(2048);
    expect(errorOf("{a|b|c}", 2)).toContain("more than 2");
  });

  it("detects the cap without building a huge list", () => {
    const pattern = Array.from({ length: 60 }, () => "{a|b}").join("");
    expect(errorOf(pattern)).toContain("more than");
  });
});

describe("isPattern", () => {
  it.each([
    ["plain", false],
    ["a {b|c}", true],
    ["a [b]", true],
    [String.raw`a \[b\]`, false],
  ])("%j -> %s", (text, expected) => {
    expect(isPattern(text)).toBe(expected);
  });
});

describe("expandAccepted", () => {
  it("expands every entry in order, without duplicates", () => {
    expect(expandAccepted(["I {walk|run}.", "I run."])).toEqual(["I walk.", "I run."]);
  });

  it("keeps an entry that is not a valid pattern as literal text", () => {
    expect(expandAccepted(["I {walk"])).toEqual(["I {walk"]);
  });

  it("returns the same list for the same accepted array (memoized per exercise)", () => {
    const accepted = ["{a|b}"];
    expect(expandAccepted(accepted)).toBe(expandAccepted(accepted));
  });
});

describe("matchPatternAnswer", () => {
  const accepted = ["I {usually|often} {get up|wake up} at {six|6}[ o'clock]."];

  it("accepts any expansion, with the usual normalization and contractions", () => {
    expect(matchPatternAnswer("i often wake up at 6", accepted).verdict).toBe("correct");
    expect(matchPatternAnswer("I usually get up at six o'clock!", accepted)).toEqual({
      verdict: "correct",
      closest: "I usually get up at six o'clock.",
    });
  });

  it("is 'almost' with a typo, and reports the closest expansion", () => {
    expect(matchPatternAnswer("I usualy get up at six.", accepted)).toEqual({
      verdict: "almost",
      closest: "I usually get up at six.",
    });
  });

  it("is wrong for a grammar mistake", () => {
    expect(matchPatternAnswer("I usually get up in six.", accepted).verdict).toBe("wrong");
  });

  it("handles contractions on either side", () => {
    expect(matchPatternAnswer("I'm not {hungry|full}.", []).verdict).toBe("wrong");
    expect(matchPatternAnswer("I am not full", ["I'm not {hungry|full}."]).verdict).toBe("correct");
  });
});
