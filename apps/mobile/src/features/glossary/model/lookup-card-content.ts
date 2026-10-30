import type { GlossaryEntry } from "@english-learn/domain";

/** Spanish names of the glossary's parts of speech (`pos`); unknown ones are shown as they are. */
const PART_OF_SPEECH: Readonly<Record<string, string>> = {
  noun: "sustantivo",
  verb: "verbo",
  adjective: "adjetivo",
  adverb: "adverbio",
  expression: "expresión",
  preposition: "preposición",
  "phrasal verb": "phrasal verb",
  pronoun: "pronombre",
  determiner: "determinante",
  "proper noun": "nombre propio",
  auxiliary: "verbo auxiliar",
  conjunction: "conjunción",
  number: "número",
  interjection: "interjección",
};

export function partOfSpeechLabel(pos: string): string {
  return PART_OF_SPEECH[pos] ?? pos;
}

export type LookupCardContent = {
  readonly headword: string;
  /** Shown next to the headword when every sense shares it. */
  readonly partOfSpeech: string | null;
  readonly senses: readonly { readonly es: string; readonly partOfSpeech: string | null }[];
};

/** What the lookup card shows for an entry: headword, part of speech and 1–3 Spanish senses. */
export function lookupCardContent(entry: GlossaryEntry): LookupCardContent {
  const kinds = new Set(entry.senses.map((s) => s.pos));
  const [only] = kinds;
  const shared = kinds.size === 1 && only !== undefined ? partOfSpeechLabel(only) : null;
  return {
    headword: entry.headword,
    partOfSpeech: shared,
    senses: entry.senses.map((s) => ({
      es: s.es,
      partOfSpeech: shared === null && s.pos !== undefined ? partOfSpeechLabel(s.pos) : null,
    })),
  };
}
