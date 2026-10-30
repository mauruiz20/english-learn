import type { GlossaryEntry } from "@english-learn/domain";
import { lookupCardContent, partOfSpeechLabel } from "./lookup-card-content";

const entry = (senses: GlossaryEntry["senses"]): GlossaryEntry => ({
  id: "glossary.left",
  headword: "left",
  kind: "word",
  forms: ["left"],
  senses,
});

describe("partOfSpeechLabel", () => {
  it.each([
    ["noun", "sustantivo"],
    ["verb", "verbo"],
    ["phrasal verb", "phrasal verb"],
    ["proper noun", "nombre propio"],
    ["something new", "something new"],
  ])("%j -> %j", (pos, label) => {
    expect(partOfSpeechLabel(pos)).toBe(label);
  });
});

describe("lookupCardContent", () => {
  it("puts a part of speech shared by every sense next to the headword", () => {
    expect(
      lookupCardContent(
        entry([
          { es: "temprano", pos: "adverb" },
          { es: "pronto", pos: "adverb" },
        ]),
      ),
    ).toEqual({
      headword: "left",
      partOfSpeech: "adverbio",
      senses: [
        { es: "temprano", partOfSpeech: null },
        { es: "pronto", partOfSpeech: null },
      ],
    });
  });

  it("labels each sense when they differ", () => {
    expect(
      lookupCardContent(
        entry([
          { es: "salió", pos: "verb" },
          { es: "izquierda", pos: "noun" },
          { es: "izquierdo" },
        ]),
      ),
    ).toEqual({
      headword: "left",
      partOfSpeech: null,
      senses: [
        { es: "salió", partOfSpeech: "verbo" },
        { es: "izquierda", partOfSpeech: "sustantivo" },
        { es: "izquierdo", partOfSpeech: null },
      ],
    });
  });

  it("has no part of speech when the entry gives none", () => {
    expect(lookupCardContent(entry([{ es: "hola" }])).partOfSpeech).toBeNull();
  });
});
