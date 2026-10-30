import { buildGlossaryIndex, type GlossaryEntry } from "@english-learn/domain";
import { buildEntryItems, itemEntryIds } from "./item-entries";

const entry = (id: string, forms: readonly string[]): GlossaryEntry => ({
  id,
  headword: forms[0] ?? id,
  kind: forms.some((f) => f.includes(" ")) ? "phrase" : "word",
  forms,
  senses: [{ es: id }],
});

const INDEX = buildGlossaryIndex([
  entry("wake-up", ["wake up", "woke up"]),
  entry("wake", ["wake"]),
  entry("up", ["up"]),
  entry("go-straight", ["go straight"]),
  entry("go-straight-ahead", ["go straight ahead"]),
  entry("there-is", ["there is"]),
  entry("there-are", ["there are"]),
  entry("kitchen", ["kitchen", "kitchens"]),
  entry("excuse-me", ["excuse me"]),
  entry("turn", ["turn"]),
  entry("look-forward-to", ["look forward to"]),
  entry("left", ["left"]),
]);

describe("itemEntryIds", () => {
  it.each([
    ["kitchen", ["kitchen"]],
    ["Kitchen", ["kitchen"]],
    ["wake up", ["wake-up"]],
    ["go straight (ahead)", ["go-straight", "go-straight-ahead"]],
    ["there is / there are", ["there-is", "there-are"]],
    ["look forward to + -ing", ["look-forward-to"]],
    ["Excuse me, where is...?", []],
    ["imperative for directions (Turn left.)", []],
    ["unknown", []],
  ])("%j -> %j", (term, expected) => {
    expect(itemEntryIds(term, INDEX)).toEqual(expected);
  });

  it("does not match a term that only some of its words cover", () => {
    expect(itemEntryIds("wake the kitchen", INDEX)).toEqual([]);
  });
});

describe("buildEntryItems", () => {
  it("maps each glossary entry to the items whose term it is", () => {
    const map = buildEntryItems(
      [
        { id: "a2.routine.wake-up", term: "wake up" },
        { id: "a2.home.kitchen", term: "kitchen" },
        { id: "b1.home.kitchen", term: "kitchens" },
        { id: "a2.grammar.x", term: "imperative for directions (Turn left.)" },
      ],
      INDEX,
    );

    expect(map.get("wake-up")).toEqual(["a2.routine.wake-up"]);
    expect(map.get("kitchen")).toEqual(["a2.home.kitchen", "b1.home.kitchen"]);
    expect(map.get("left")).toBeUndefined();
  });
});
