export type GlossaryKind = "word" | "phrase";

export interface GlossarySense {
  /** Spanish gloss. */
  readonly es: string;
  /** Part of speech (e.g. `verb`, `noun`), when it helps tell senses apart. */
  readonly pos?: string | undefined;
}

export interface GlossaryEntry {
  readonly id: string;
  /** Dictionary form shown to the learner (case preserved: `June`, `I'm`). */
  readonly headword: string;
  readonly kind: GlossaryKind;
  /**
   * Every lowercase surface form that links to this entry, including the
   * headword itself. Phrase forms are space-separated words (`traffic jams`).
   */
  readonly forms: readonly string[];
  /** 1–3 senses, most common first. */
  readonly senses: readonly GlossarySense[];
}

/** A slice of text: a word to look up, or anything else (spaces, punctuation, numbers). */
export interface Token {
  readonly kind: "word" | "other";
  readonly text: string;
  /** Offset of the first character (UTF-16 code units, like `String.prototype.slice`). */
  readonly start: number;
  /** Offset just past the last character. */
  readonly end: number;
}

/** A slice of annotated text. Concatenating every segment's `text` rebuilds the input. */
export interface Segment {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** The glossary entry for a word or phrase; `null` for other text and uncovered words. */
  readonly entryId: string | null;
  readonly kind: "word" | "phrase" | "other";
}

export interface GlossaryIndex {
  readonly entriesById: ReadonlyMap<string, GlossaryEntry>;
  /** Single-word form -> entry id. */
  readonly words: ReadonlyMap<string, string>;
  /** First word of a phrase form -> candidate phrases, longest first. */
  readonly phrases: ReadonlyMap<string, readonly PhraseForm[]>;
  /** Every hyphenated word that appears in a form; the tokenizer keeps these whole. */
  readonly hyphenated: ReadonlySet<string>;
}

export interface PhraseForm {
  readonly words: readonly string[];
  readonly entryId: string;
}
