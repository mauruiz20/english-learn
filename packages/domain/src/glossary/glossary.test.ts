import { describe, expect, it } from "vitest";
import {
  annotateText,
  buildGlossaryIndex,
  glossaryKey,
  lookupWord,
  tokenizeForGlossary,
  type GlossaryEntry,
  type Segment,
  type Token,
} from "./index";

const words = (tokens: readonly Token[]) =>
  tokens.filter((t) => t.kind === "word").map((t) => t.text);

const entry = (
  id: string,
  forms: readonly string[],
  kind: GlossaryEntry["kind"] = forms.some((f) => f.includes(" ")) ? "phrase" : "word",
): GlossaryEntry => ({
  id,
  headword: forms[0] ?? id,
  kind,
  forms,
  senses: [{ es: `es:${id}` }],
});

const ENTRIES: readonly GlossaryEntry[] = [
  entry("traffic", ["traffic"]),
  entry("jam", ["jam", "jams"]),
  entry("traffic-jam", ["traffic jam", "traffic jams"]),
  entry("get", ["get", "gets", "got", "getting"]),
  entry("up", ["up"]),
  entry("get-up", ["get up", "gets up", "got up", "getting up"]),
  entry("show", ["show", "showed"]),
  entry("me", ["me"]),
  entry("around", ["around"]),
  entry("show-around", ["show me around", "showed me around"]),
  entry("show-me", ["show me"]),
  entry("i", ["i"]),
  entry("im", ["i'm"]),
  entry("wont", ["won't"]),
  entry("city", ["city", "cities"]),
  entry("well-known", ["well-known"]),
  entry("well", ["well"]),
  entry("long", ["long"]),
  entry("term", ["term"]),
  entry("student", ["student", "students"]),
  entry("pm", ["p.m."]),
  entry("at", ["at"]),
  entry("june", ["june"]),
  entry("its", ["it's"]),
  entry("o-clock", ["o'clock"]),
];

const INDEX = buildGlossaryIndex(ENTRIES);

const rebuild = (segments: readonly Segment[]) => segments.map((s) => s.text).join("");

const linked = (segments: readonly Segment[]) =>
  segments.filter((s) => s.entryId !== null).map((s) => [s.text, s.entryId]);

describe("glossaryKey", () => {
  it.each([
    ["Won’t", "won't"],
    ["I‘M", "i'm"],
    ["Café", "café"],
    ["June", "june"],
  ])("%j -> %j", (input, expected) => {
    expect(glossaryKey(input)).toBe(expected);
  });
});

describe("tokenizeForGlossary", () => {
  it("keeps apostrophes inside words", () => {
    expect(words(tokenizeForGlossary("I won't go, I'm sure the city's park is open."))).toEqual([
      "I",
      "won't",
      "go",
      "I'm",
      "sure",
      "the",
      "city's",
      "park",
      "is",
      "open",
    ]);
  });

  it("accepts curly apostrophes inside words", () => {
    expect(words(tokenizeForGlossary("I don’t know"))).toEqual(["I", "don’t", "know"]);
  });

  it("leaves a trailing apostrophe (plural possessive or closing quote) out of the word", () => {
    expect(words(tokenizeForGlossary("The students' books."))).toEqual([
      "The",
      "students",
      "books",
    ]);
    expect(words(tokenizeForGlossary("What does 'do the dishes' mean?"))).toEqual([
      "What",
      "does",
      "do",
      "the",
      "dishes",
      "mean",
    ]);
  });

  it("ignores numbers, tokens with digits and punctuation", () => {
    expect(words(tokenizeForGlossary("In 2019, the 3rd bus left at 8:30 — fast!"))).toEqual([
      "In",
      "the",
      "bus",
      "left",
      "at",
      "fast",
    ]);
  });

  it("keeps dotted abbreviations such as p.m. together", () => {
    expect(words(tokenizeForGlossary("It starts at 8 p.m. today."))).toEqual([
      "It",
      "starts",
      "at",
      "p.m.",
      "today",
    ]);
  });

  it("splits hyphenated words unless the hyphenated form is known", () => {
    const text = "A well-known long-term plan.";
    expect(words(tokenizeForGlossary(text))).toEqual([
      "A",
      "well",
      "known",
      "long",
      "term",
      "plan",
    ]);
    expect(words(tokenizeForGlossary(text, (key) => key === "well-known"))).toEqual([
      "A",
      "well-known",
      "long",
      "term",
      "plan",
    ]);
  });

  it("reports character offsets that slice back to the token text", () => {
    const text = "¿Where's   Ana’s cat?";
    for (const token of tokenizeForGlossary(text)) {
      expect(text.slice(token.start, token.end)).toBe(token.text);
    }
  });

  it("alternates word and non-word tokens and covers the whole text", () => {
    const text = '  "Hi," she said -- well-known... 42 cats\n';
    const tokens = tokenizeForGlossary(text);
    expect(tokens.map((t) => t.text).join("")).toBe(text);
    tokens.slice(1).forEach((t, i) => expect(t.kind).not.toBe(tokens[i]?.kind));
  });

  it("returns no tokens for empty text", () => {
    expect(tokenizeForGlossary("")).toEqual([]);
  });
});

describe("lookupWord", () => {
  it("is case-insensitive and normalizes curly apostrophes", () => {
    expect(lookupWord(INDEX, "WON’T")).toBe("wont");
    expect(lookupWord(INDEX, "June")).toBe("june");
  });

  it("falls back from 's and s' possessives to the base form", () => {
    expect(lookupWord(INDEX, "city's")).toBe("city");
    expect(lookupWord(INDEX, "students'")).toBe("student");
    expect(lookupWord(INDEX, "cities'")).toBe("city");
  });

  it("prefers a listed 's form over the possessive fallback", () => {
    expect(lookupWord(INDEX, "It's")).toBe("its");
  });

  it("returns null for unknown words", () => {
    expect(lookupWord(INDEX, "zebra")).toBeNull();
    expect(lookupWord(INDEX, "zebra's")).toBeNull();
  });
});

describe("buildGlossaryIndex", () => {
  it("indexes entries by id", () => {
    expect(INDEX.entriesById.get("city")?.forms).toEqual(["city", "cities"]);
  });

  it("keeps the first entry when two entries share a form", () => {
    const index = buildGlossaryIndex([entry("a", ["x"]), entry("b", ["x"])]);
    expect(lookupWord(index, "x")).toBe("a");
  });
});

describe("annotateText", () => {
  it("links phrases before single words, longest match first", () => {
    expect(linked(annotateText("Show me around the city.", INDEX))).toEqual([
      ["Show me around", "show-around"],
      ["city", "city"],
    ]);
    expect(linked(annotateText("Show me the jam.", INDEX))).toEqual([
      ["Show me", "show-me"],
      ["jam", "jam"],
    ]);
  });

  it("matches inflected phrase forms case-insensitively", () => {
    expect(linked(annotateText("Traffic Jams again! I got up late.", INDEX))).toEqual([
      ["Traffic Jams", "traffic-jam"],
      ["I", "i"],
      ["got up", "get-up"],
    ]);
  });

  it("does not match a phrase across punctuation", () => {
    expect(linked(annotateText("I got, up", INDEX))).toEqual([
      ["I", "i"],
      ["got", "get"],
      ["up", "up"],
    ]);
  });

  it("does not match a phrase across a cloze blank", () => {
    expect(linked(annotateText("traffic ___ jam", INDEX))).toEqual([
      ["traffic", "traffic"],
      ["jam", "jam"],
    ]);
  });

  it("resolves contractions, possessives, abbreviations and known hyphenated words", () => {
    expect(
      linked(annotateText("I’m sure I won't be at the city's well-known at 8 p.m.", INDEX)),
    ).toEqual(
      expect.arrayContaining([
        ["I’m", "im"],
        ["won't", "wont"],
        ["city's", "city"],
        ["well-known", "well-known"],
        ["p.m.", "pm"],
      ]),
    );
  });

  it("splits an unknown hyphenated word into its known parts", () => {
    expect(linked(annotateText("long-term", INDEX))).toEqual([
      ["long", "long"],
      ["term", "term"],
    ]);
  });

  it("marks uncovered words and non-word text with a null entry", () => {
    const segments = annotateText("A zebra!", INDEX);
    expect(segments).toEqual([
      { text: "A", start: 0, end: 1, entryId: null, kind: "word" },
      { text: " ", start: 1, end: 2, entryId: null, kind: "other" },
      { text: "zebra", start: 2, end: 7, entryId: null, kind: "word" },
      { text: "!", start: 7, end: 8, entryId: null, kind: "other" },
    ]);
  });

  it.each([
    "",
    "   ",
    "Show me around!",
    "“Quoted” text — with dashes – and 12 numbers… ¿Qué?",
    "Traffic jams at 5 o'clock, the students' bus.\nNew line\ttab",
  ])("rebuilds the exact text from segments with consistent offsets: %j", (text) => {
    const segments = annotateText(text, INDEX);
    expect(rebuild(segments)).toBe(text);
    let cursor = 0;
    for (const s of segments) {
      expect(s.start).toBe(cursor);
      expect(text.slice(s.start, s.end)).toBe(s.text);
      cursor = s.end;
    }
    expect(cursor).toBe(text.length);
  });
});
