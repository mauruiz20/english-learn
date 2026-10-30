import { annotateText, buildGlossaryIndex, type GlossaryEntry } from "@english-learn/domain";
import { lookupRuns } from "./lookup-runs";

const entry = (id: string, forms: readonly string[]): GlossaryEntry => ({
  id,
  headword: forms[0] ?? id,
  kind: forms.some((f) => f.includes(" ")) ? "phrase" : "word",
  forms,
  senses: [{ es: id }],
});

const INDEX = buildGlossaryIndex([
  entry("what", ["what"]),
  entry("does", ["does"]),
  entry("wake-up", ["wake up"]),
  entry("mean", ["mean"]),
  entry("i", ["i"]),
]);

const text = "What does 'wake up' mean?";
const segments = annotateText(text, INDEX);

describe("lookupRuns", () => {
  it("links every covered word and merges the plain text between them", () => {
    expect(lookupRuns(segments)).toEqual([
      { text: "What", entryId: "what" },
      { text: " ", entryId: null },
      { text: "does", entryId: "does" },
      { text: " '", entryId: null },
      { text: "wake up", entryId: "wake-up" },
      { text: "' ", entryId: null },
      { text: "mean", entryId: "mean" },
      { text: "?", entryId: null },
    ]);
  });

  it("leaves words in a locked range as plain text", () => {
    const start = text.indexOf("wake");
    expect(lookupRuns(segments, { lockedRanges: [[start, start + "wake up".length]] })).toEqual([
      { text: "What", entryId: "what" },
      { text: " ", entryId: null },
      { text: "does", entryId: "does" },
      { text: " 'wake up' ", entryId: null },
      { text: "mean", entryId: "mean" },
      { text: "?", entryId: null },
    ]);
  });

  it("locks a phrase that only partly overlaps a locked range", () => {
    const start = text.indexOf("up");
    const runs = lookupRuns(segments, { lockedRanges: [[start, start + 2]] });
    expect(runs.find((r) => r.text.includes("wake"))?.entryId).toBeNull();
  });

  it("locks every occurrence of a locked entry", () => {
    const runs = lookupRuns(annotateText("I mean what I mean", INDEX), {
      lockedEntryIds: ["mean"],
    });
    expect(runs.filter((r) => r.entryId !== null).map((r) => r.text)).toEqual(["I", "what", "I"]);
  });

  it("rebuilds the text exactly", () => {
    const runs = lookupRuns(segments, { lockedEntryIds: ["does"] });
    expect(runs.map((r) => r.text).join("")).toBe(text);
  });
});
