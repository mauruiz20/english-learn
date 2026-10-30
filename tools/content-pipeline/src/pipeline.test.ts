import { describe, expect, it } from "vitest";
import { ENG_DETAILED, LINKS, SPA_DETAILED } from "./__fixtures__/fixtures";
import { buildShortlist, matchKeywords } from "./candidates";
import {
  bareWord,
  filterPair,
  hasBlockedWord,
  hasDigits,
  hasProperName,
  inWordRange,
} from "./filter";
import { buildPairs, parseLinkRow, parseSentenceRow, parseTsv, type Pair } from "./tatoeba";

const eng = parseTsv(ENG_DETAILED, parseSentenceRow);
const spa = parseTsv(SPA_DETAILED, parseSentenceRow);
const links = parseTsv(LINKS, parseLinkRow);
const pairs = buildPairs(eng, spa, links);
const pairOf = (id: number): Pair => {
  const p = pairs.find((x) => x.eng.id === id);
  if (!p) throw new Error(`no pair ${id}`);
  return p;
};

describe("parseSentenceRow", () => {
  it("parses id, lang, text and author", () => {
    expect(parseSentenceRow("10\teng\tHello there.\tsomeone\t2010\t2011")).toEqual({
      id: 10,
      lang: "eng",
      text: "Hello there.",
      author: "someone",
    });
  });
  it("maps a \\N or empty username to a null author", () => {
    expect(parseSentenceRow("12\teng\tHi.\t\\N\t\\N\t\\N")?.author).toBeNull();
    expect(parseSentenceRow("12\teng\tHi.\t\t\t")?.author).toBeNull();
  });
  it("tolerates CRLF line endings", () => {
    expect(parseSentenceRow("12\teng\tHi.\tme\r")?.author).toBe("me");
  });
  it("rejects malformed rows", () => {
    for (const line of ["broken row", "x\teng\tHi.", "0\teng\tHi.", "5\teng\t  ", "5\t\\N\tHi."]) {
      expect(parseSentenceRow(line), line).toBeNull();
    }
  });
});

describe("parseLinkRow / parseTsv", () => {
  it("parses links and skips malformed lines", () => {
    expect(parseLinkRow("1\t77")).toEqual([1, 77]);
    expect(parseLinkRow("1")).toBeNull();
    expect(parseLinkRow("a\tb")).toBeNull();
    expect(parseTsv("1\t2\n\nbad\n3\t4\n", parseLinkRow)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
  it("drops the fixture row without tabs", () => {
    expect(eng.map((s) => s.id)).toEqual([10, 11, 12, 13, 14, 15, 17]);
  });
});

describe("buildPairs", () => {
  it("joins links in either direction, deduplicates, and orders by English id", () => {
    expect(pairs.map((p) => p.eng.id)).toEqual([10, 11, 12, 13, 14, 15]);
    expect(pairOf(10).spa.map((s) => s.id)).toEqual([20]);
    expect(pairOf(13).spa.map((s) => s.id)).toEqual([23, 24]);
    expect(pairOf(15).spa.map((s) => s.id)).toEqual([26]);
  });
  it("ignores sentences in the wrong language", () => {
    const wrong = [{ id: 10, lang: "spa", text: "x.", author: "a" }];
    expect(buildPairs(wrong, spa, links)).toEqual([]);
  });
});

describe("filters", () => {
  it("counts words for the level ranges (A2 3-14, B1 6-20)", () => {
    expect(inWordRange("I am here.", "A2")).toBe(true);
    expect(inWordRange("Go home.", "A2")).toBe(false);
    expect(inWordRange("I am here.", "B1")).toBe(false);
    expect(inWordRange(Array(14).fill("go").join(" "), "A2")).toBe(true);
    expect(inWordRange(Array(15).fill("go").join(" "), "A2")).toBe(false);
    expect(inWordRange(Array(20).fill("go").join(" "), "B1")).toBe(true);
  });
  it("detects digits, proper names and blocked words", () => {
    expect(hasDigits("I bought 3 apples.")).toBe(true);
    expect(hasDigits("I bought three apples.")).toBe(false);
    expect(hasProperName("Tom is cooking dinner.")).toBe(true);
    expect(hasProperName("We visited London last summer.")).toBe(true);
    expect(hasProperName("I'm free on Monday and I speak English.")).toBe(false);
    expect(hasProperName("Mary's car is red.")).toBe(true);
    expect(hasBlockedWord("I hate Mondays.")).toBe(true);
    expect(hasBlockedWord("I love Mondays.")).toBe(false);
  });
  it("normalizes words for matching", () => {
    expect(bareWord("“Hello,”")).toBe("hello");
    expect(bareWord("It’s")).toBe("it's");
  });
  it("keeps clean attributed pairs and drops the rest", () => {
    expect(filterPair(pairOf(10), "A2")?.spa.map((s) => s.id)).toEqual([20]);
    expect(filterPair(pairOf(11), "A2")).toBeNull(); // proper name
    expect(filterPair(pairOf(12), "A2")).toBeNull(); // no English author
    expect(filterPair(pairOf(14), "A2")).toBeNull(); // digits
    // the unattributed Spanish translation is dropped, the attributed one kept
    expect(filterPair(pairOf(13), "A2")?.spa.map((s) => s.id)).toEqual([24]);
  });
  it("drops a pair whose only translations are unattributed", () => {
    const p: Pair = {
      eng: pairOf(10).eng,
      spa: [{ id: 9, lang: "spa", text: "Hola.", author: null }],
    };
    expect(filterPair(p, "A2")).toBeNull();
  });
});

describe("candidates", () => {
  it("matches single and multi-word keywords, ignoring case and punctuation", () => {
    expect(matchKeywords("It's cold and windy today.", ["windy", "cold and", "rain"])).toEqual([
      "windy",
      "cold and",
    ]);
    expect(matchKeywords("I wake up early.", ["wake up", "up early", "woke"])).toEqual([
      "wake up",
      "up early",
    ]);
  });
  it("builds a ranked shortlist per topic with Tatoeba attribution", () => {
    const list = buildShortlist(
      pairs,
      { food: ["breakfast", "lunch", "rice", "vegetables"], weather: ["cold", "windy", "raining"] },
      "A2",
      10,
    );
    expect(list.food?.map((c) => c.sentenceId)).toEqual([13, 10]);
    expect(list.weather?.map((c) => c.sentenceId)).toEqual([15]);
    expect(list.food?.[0]).toEqual({
      sentenceId: 13,
      author: "carol_u",
      license: "CC BY 2.0 FR",
      text: "We ate rice and vegetables for lunch.",
      wordCount: 7,
      matched: ["lunch", "rice", "vegetables"],
      es: [{ sentenceId: 24, author: "esp_d", text: "Almorzamos arroz y verduras." }],
    });
  });
  it("applies the limit", () => {
    const list = buildShortlist(pairs, { food: ["breakfast", "lunch"] }, "A2", 1);
    expect(list.food).toHaveLength(1);
  });
});
