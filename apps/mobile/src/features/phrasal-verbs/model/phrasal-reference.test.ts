import { corpus } from "@english-learn/content/corpus";
import { phrasalReference } from "./phrasal-reference";

describe("phrasal verb reference", () => {
  it("groups all 110 authored bilingual entries under their existing topics", () => {
    const groups = phrasalReference(corpus);
    expect(groups).toHaveLength(20);
    const entries = groups.flatMap((group) => group.entries);
    expect(entries).toHaveLength(110);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(110);
    for (const entry of entries) {
      expect(entry.verb.trim()).not.toBe("");
      expect(entry.es.trim()).not.toBe("");
      expect(entry.example.en.trim()).not.toBe("");
      expect(entry.example.es.trim()).not.toBe("");
    }
  });

  it("preserves card examples and practice meanings without reading distractors", () => {
    const groups = phrasalReference(corpus);
    const home = groups.find((group) => group.id === "practice.phrasal-verbs.home");
    expect(home?.entries.find((entry) => entry.verb === "clean (something) up")).toMatchObject({
      es: "ordenar, limpiar",
      example: { en: "Please clean up your room before dinner." },
    });
    for (const card of corpus.cards) {
      if (card.kind !== "phrasal_verbs") continue;
      expect(
        groups
          .find((group) => group.id === card.id)
          ?.entries.map(({ verb, es, example }) => ({ verb, es, example })),
      ).toEqual(card.entries.map(({ verb, es, example }) => ({ verb, es, example })));
    }
  });
});
