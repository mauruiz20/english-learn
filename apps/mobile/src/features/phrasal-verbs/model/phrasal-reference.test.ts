import { corpus } from "@english-learn/content/corpus";
import { phrasalReference } from "./phrasal-reference";

describe("phrasal verb reference", () => {
  it("groups all 125 authored bilingual entries under their existing topics", () => {
    const groups = phrasalReference(corpus);
    expect(groups.length).toBeGreaterThan(20);
    const entries = groups.flatMap((group) => group.entries);
    expect(entries).toHaveLength(125);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(125);
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

it("includes phrasal verbs taught outside the phrasal topic, without collapsing distinct meanings", () => {
  const entries = phrasalReference(corpus).flatMap((group) => group.entries);
  const forward = entries.filter((entry) => entry.verb === "look forward to");
  expect(forward).toHaveLength(1);
  expect(forward[0]).toMatchObject({
    es: "tener muchas ganas de, esperar con ilusión",
    example: { en: "We're looking forward to seeing you.", es: "Tenemos muchas ganas de verte." },
  });
  for (const verb of [
    "look for",
    "look like",
    "go out",
    "try on",
    "walk past (something)",
    "pay back",
    "save up (for)",
    "throw away",
    "set off",
    "find out",
    "brush up on",
    "keep up with",
    "speak out (against)",
  ]) {
    expect(entries.some((entry) => entry.verb === verb)).toBe(true);
  }
  expect(entries.filter((entry) => entry.verb === "pick up").map((entry) => entry.es)).toEqual(
    expect.arrayContaining(["recoger (a alguien)", "aprender (sin estudiar formalmente)"]),
  );
});
