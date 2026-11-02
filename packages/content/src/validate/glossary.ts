import {
  annotateText,
  buildGlossaryIndex,
  expandPattern,
  glossaryKey,
  type GlossaryIndex,
} from "@english-learn/domain";
import type { Card, GlossaryEntry } from "../schema";
import type { AnyExercise } from "./helpers";
import type { LoadedFile, Rule, ValidationError } from "./types";

const GLOSSARY_FILE = /^glossary\/([a-z])\.json$/;
/** A form is words separated by single spaces; a word is letters with inner `'`/`-`, or `p.m.`. */
const FORM_WORD = String.raw`(?:\p{Ll}\.){2,}|[\p{Ll}\p{M}]+(?:['-][\p{Ll}\p{M}]+)*`;
const FORM = new RegExp(`^(?:${FORM_WORD})(?: (?:${FORM_WORD}))*$`, "u");

/** Sort key and file letter of a headword: its lookup key without accents. */
const headwordKey = (headword: string) =>
  glossaryKey(headword).normalize("NFD").replace(/\p{M}/gu, "");

interface LocatedEntry {
  readonly file: string;
  readonly index: number;
  readonly entry: GlossaryEntry;
}

function glossaryEntries(files: readonly LoadedFile[]): LocatedEntry[] {
  return files.flatMap(({ file, data }) =>
    (data.glossary ?? []).map((entry, index) => ({ file, index, entry })),
  );
}

/**
 * Per-file glossary rules: files are `glossary/<letter>.json`, entries sorted by
 * headword and filed under its first letter; forms are lowercase words with
 * straight apostrophes, include the headword, have no duplicates, and match
 * the entry kind (one word for `word`, several for `phrase`).
 */
export const validateGlossaryEntries: Rule = (files) => {
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    const glossary = data.glossary ?? [];
    if (glossary.length === 0) continue;
    const letter = GLOSSARY_FILE.exec(file)?.[1];
    if (letter === undefined) {
      errors.push({
        file,
        path: "(root)",
        message: "glossary files must be named glossary/<letter>.json (a-z)",
      });
    }
    glossary.forEach((entry, i) => {
      const at = `glossary[${i}]`;
      const key = headwordKey(entry.headword);
      if (letter !== undefined && !key.startsWith(letter)) {
        errors.push({
          file,
          path: `${at}.headword`,
          message: `headword "${entry.headword}" belongs in glossary/${key[0] ?? ""}.json`,
        });
      }
      const previous = glossary[i - 1];
      if (previous !== undefined && headwordKey(previous.headword) > key) {
        errors.push({
          file,
          path: `${at}.headword`,
          message: `entries must be sorted by headword: "${entry.headword}" comes before "${previous.headword}"`,
        });
      }
      if (!entry.forms.includes(glossaryKey(entry.headword))) {
        errors.push({
          file,
          path: `${at}.forms`,
          message: `forms must include the headword "${glossaryKey(entry.headword)}"`,
        });
      }
      const seen = new Set<string>();
      entry.forms.forEach((form, f) => {
        const path = `${at}.forms[${f}]`;
        const fail = (message: string) => errors.push({ file, path, message });
        if (seen.has(form)) fail(`duplicate form "${form}"`);
        else if (form !== glossaryKey(form))
          fail(`form "${form}" must be lowercase with straight apostrophes`);
        else if (!FORM.test(form)) fail(`form "${form}" must be words separated by single spaces`);
        else if (entry.kind === "word" && form.includes(" "))
          fail(`a word entry cannot have the multi-word form "${form}"`);
        else if (entry.kind === "phrase" && !form.includes(" "))
          fail(`a phrase entry needs multi-word forms, not "${form}"`);
        seen.add(form);
      });
    });
  }
  return errors;
};

/**
 * Glossary ids are unique, and a form belongs to at most one entry across the
 * whole glossary (homographs share one entry with several senses).
 */
export const validateGlossaryForms: Rule = (files) => {
  const errors: ValidationError[] = [];
  const ids = new Map<string, string>();
  const owners = new Map<string, LocatedEntry>();
  for (const located of glossaryEntries(files)) {
    const { file, index, entry } = located;
    const firstFile = ids.get(entry.id);
    if (firstFile !== undefined) {
      errors.push({
        file,
        path: `glossary[${index}].id`,
        message: `duplicate glossary id "${entry.id}" (first in ${firstFile})`,
      });
    } else {
      ids.set(entry.id, file);
    }
    entry.forms.forEach((form, f) => {
      const owner = owners.get(form);
      if (owner === undefined) owners.set(form, located);
      else if (owner !== located) {
        errors.push({
          file,
          path: `glossary[${index}].forms[${f}]`,
          message: `form "${form}" already belongs to ${owner.entry.id} (${owner.file}); merge the senses into one entry`,
        });
      }
    });
  }
  return errors;
};

/** A piece of learner-visible English text and where it lives. */
export interface GlossaryText {
  readonly file: string;
  readonly path: string;
  readonly text: string;
}

/** `Choose the English for '<Spanish>'.`: only the English lead-in is checked. */
const SPANISH_TERM_PROMPT = /^(Choose the English for) '.+'\.$/;

function exerciseTexts(exercise: AnyExercise, at: string): [string, string][] {
  const list = (base: string, values: readonly string[]): [string, string][] =>
    values.map((v, i) => [`${at}.${base}[${i}]`, v]);
  switch (exercise.type) {
    case "vocab":
      // Options are Spanish, and so is the quoted term of a "Choose the English for" prompt.
      return [[`${at}.prompt`, exercise.prompt.replace(SPANISH_TERM_PROMPT, "$1")]];
    case "cloze":
      return [
        [`${at}.sentence`, exercise.sentence],
        ...list("answers", exercise.answers),
        ...list("distractors", exercise.distractors),
      ];
    case "word_order":
      return [[`${at}.tokens`, exercise.tokens.join(" ")], ...list("accepted", exercise.accepted)];
    case "translation_choice":
      // Options are Spanish.
      return [[`${at}.sentence`, exercise.sentence]];
    case "reading":
      return exercise.questions.flatMap((q, i): [string, string][] => [
        [`${at}.questions[${i}].prompt`, q.prompt],
        ...q.options.map((o, j): [string, string] => [`${at}.questions[${i}].options[${j}]`, o]),
      ]);
    case "translate_write":
      // The Spanish prompt is skipped; accepted answers are shown as corrections, so every
      // sentence a pattern stands for is checked (once).
      return exercise.accepted.flatMap((entry, i): [string, string][] => {
        const result = expandPattern(entry);
        const sentences = result.ok ? result.expansions : [entry];
        return sentences.map((sentence) => [`${at}.accepted[${i}]`, sentence]);
      });
  }
}

/**
 * Every learner-visible English text: item terms and examples, exercise prompts, sentences,
 * answers and options (except Spanish options), passage titles and texts, and
 * placement exercises. Word-order tokens are joined with spaces.
 */
export function glossaryTexts(files: readonly LoadedFile[]): GlossaryText[] {
  const out: GlossaryText[] = [];
  for (const { file, data } of files) {
    const add = ([path, text]: [string, string]) => out.push({ file, path, text });
    (data.items ?? []).forEach((item, i) => {
      add([`items[${i}].term`, item.term]);
      if (item.example !== undefined) add([`items[${i}].example.en`, item.example.en]);
    });
    (data.exercises ?? []).forEach((ex, i) => exerciseTexts(ex, `exercises[${i}]`).forEach(add));
    (data.passages ?? []).forEach((p, i) => {
      add([`passages[${i}].title`, p.title]);
      add([`passages[${i}].text`, p.text]);
    });
    (data.placement ?? []).forEach((q, i) =>
      exerciseTexts(q.exercise, `placement[${i}].exercise`).forEach(add),
    );
    (data.cards ?? []).forEach((card, i) => cardTexts(card, `cards[${i}]`).forEach(add));
  }
  return out;
}

/** English text of a card: pitfall corrections, examples, phrasal verbs, collocations, the false friend. */
function cardTexts(card: Card, at: string): [string, string][] {
  const out: [string, string][] = [];
  // `wrong` holds deliberate mistakes ("lended", "rised") that must not become glossary forms.
  card.pitfalls.forEach((p, i) => out.push([`${at}.pitfalls[${i}].right`, p.right]));
  card.examples.forEach((e, i) => out.push([`${at}.examples[${i}].en`, e.en]));
  if (card.kind === "phrasal_verbs") {
    card.entries.forEach((e, i) => {
      out.push(
        [`${at}.entries[${i}].verb`, e.verb],
        [`${at}.entries[${i}].example.en`, e.example.en],
      );
    });
  }
  if (card.kind === "vocabulary") {
    card.collocations?.forEach((c, i) => out.push([`${at}.collocations[${i}].en`, c.en]));
    if (card.falseFriend) out.push([`${at}.falseFriend.en`, card.falseFriend.en]);
  }
  return out;
}

/** Builds the domain lookup index from every glossary entry in the corpus. */
export function glossaryIndex(files: readonly LoadedFile[]): GlossaryIndex {
  return buildGlossaryIndex(glossaryEntries(files).map(({ entry }) => entry));
}

export interface UncoveredWord extends GlossaryText {
  /** The word as written in the text (first occurrence). */
  readonly word: string;
}

/** Words with no glossary entry, once per text (case-insensitive). */
export function findUncoveredWords(files: readonly LoadedFile[]): UncoveredWord[] {
  const index = glossaryIndex(files);
  const out: UncoveredWord[] = [];
  // Once per word and place: the sentences of one answer pattern share their path.
  const seen = new Set<string>();
  for (const text of glossaryTexts(files)) {
    for (const segment of annotateText(text.text, index)) {
      if (segment.kind !== "word" || segment.entryId !== null) continue;
      const key = `${text.file}\u0000${text.path}\u0000${glossaryKey(segment.text)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...text, word: segment.text });
    }
  }
  return out;
}

/** Every word in learner-visible English text resolves to a glossary entry. */
export const validateGlossaryCoverage: Rule = (files) =>
  findUncoveredWords(files).map(({ file, path, word }) => ({
    file,
    path,
    message: `word "${word}" has no glossary entry`,
  }));

export interface GlossaryReport {
  readonly entries: number;
  readonly phrases: number;
  readonly forms: number;
  /** Forms that no learner-visible text uses (allowed; reported as a warning), sorted. */
  readonly unusedForms: readonly string[];
}

/** Glossary size and the forms no content text uses. */
export function glossaryReport(files: readonly LoadedFile[]): GlossaryReport {
  const entries = glossaryEntries(files).map(({ entry }) => entry);
  const index = glossaryIndex(files);
  const used = new Set<string>();
  for (const { text } of glossaryTexts(files)) {
    for (const segment of annotateText(text, index)) {
      if (segment.entryId === null) continue;
      const key = glossaryKey(segment.text).split(/\s+/u).join(" ");
      if (segment.kind === "phrase" || index.words.has(key)) used.add(key);
      else used.add(key.endsWith("'s") ? key.slice(0, -2) : key.slice(0, -1));
    }
  }
  const forms = entries.flatMap((e) => e.forms);
  return {
    entries: entries.length,
    phrases: entries.filter((e) => e.kind === "phrase").length,
    forms: forms.length,
    unusedForms: forms.filter((f) => !used.has(f)).sort(),
  };
}
