import { describe, expect, it } from "vitest";
import { seededRng } from "../test-support/prng";
import { scrambleTokens, shuffle, shuffleChoices } from "./shuffle";

const SEEDS = Array.from({ length: 500 }, (_, i) => i + 1);
const sorted = <T>(items: readonly T[]) => [...items].sort();

describe("shuffle", () => {
  it("returns a new array with the same elements and leaves the input untouched", () => {
    const input = Object.freeze(["a", "b", "c", "d", "e"]);
    const result = shuffle(input, seededRng(1));
    expect(result).not.toBe(input);
    expect(sorted(result)).toEqual(["a", "b", "c", "d", "e"]);
    expect(input).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("is deterministic for the same rng sequence", () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect(shuffle(items, seededRng(42))).toEqual(shuffle(items, seededRng(42)));
  });

  it.each([[[]], [["only"]]])("handles trivial input %j", (items) => {
    expect(shuffle(items, seededRng(1))).toEqual(items);
  });

  it("produces every permutation of 3 items with roughly uniform frequency", () => {
    const counts = new Map<string, number>();
    const rng = seededRng(7);
    const runs = 6000;
    for (let i = 0; i < runs; i++) {
      const key = shuffle(["a", "b", "c"], rng).join("");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(runs / 6 - 150);
      expect(count).toBeLessThan(runs / 6 + 150);
    }
  });

  it("tolerates an rng that returns values at the edges of [0, 1)", () => {
    expect(sorted(shuffle([1, 2, 3], () => 0))).toEqual([1, 2, 3]);
    expect(sorted(shuffle([1, 2, 3], () => 0.9999999999))).toEqual([1, 2, 3]);
  });
});

describe("shuffleChoices", () => {
  const options = ["went", "goed", "gone", "going"];

  it("keeps the correct option under the remapped index for every seed", () => {
    for (const seed of SEEDS) {
      const result = shuffleChoices({ options, answerIndex: 0 }, seededRng(seed));
      expect(result.options[result.answerIndex]).toBe("went");
      expect(sorted(result.options)).toEqual(sorted(options));
    }
  });

  it("places the correct option at every position across seeds", () => {
    const positions = new Set(
      SEEDS.map((seed) => shuffleChoices({ options, answerIndex: 2 }, seededRng(seed)).answerIndex),
    );
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });

  it("keeps the right index when options contain duplicates", () => {
    const result = shuffleChoices({ options: ["x", "x", "y"], answerIndex: 2 }, seededRng(3));
    expect(result.options[result.answerIndex]).toBe("y");
  });

  it.each([-1, 4, 1.5])("rejects out-of-range answerIndex %f", (answerIndex) => {
    expect(() => shuffleChoices({ options, answerIndex }, seededRng(1))).toThrow(RangeError);
  });
});

describe("scrambleTokens", () => {
  it.each([
    [["I", "am", "happy"]],
    [["a", "b"]],
    [["the", "cat", "saw", "the", "dog"]],
    [["a", "a", "b"]],
  ])("never returns the original order of %j (any seed)", (tokens) => {
    for (const seed of SEEDS) {
      const result = scrambleTokens(tokens, seededRng(seed));
      expect(result).not.toEqual(tokens);
      expect(sorted(result)).toEqual(sorted(tokens));
    }
  });

  it("still differs when the rng always yields the identity permutation", () => {
    // Fisher-Yates with rng() ≈ 1 always swaps i with itself.
    expect(scrambleTokens(["a", "b", "c"], () => 0.9999999)).not.toEqual(["a", "b", "c"]);
  });

  it("varies the result across seeds", () => {
    const tokens = ["she", "has", "never", "been", "to", "Paris"];
    const distinct = new Set(
      SEEDS.map((seed) => scrambleTokens(tokens, seededRng(seed)).join(" ")),
    );
    expect(distinct.size).toBeGreaterThan(100);
  });

  it.each([[[]], [["solo"]], [["same", "same", "same"]]])(
    "returns a copy when scrambling is impossible: %j",
    (tokens) => {
      const result = scrambleTokens(tokens, seededRng(1));
      expect(result).toEqual(tokens);
      expect(result).not.toBe(tokens);
    },
  );
});
