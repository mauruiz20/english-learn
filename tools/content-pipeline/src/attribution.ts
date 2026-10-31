/**
 * Checks that every Tatoeba-sourced exercise in the content corpus really
 * quotes the attributed English sentence. Pure: the CLI loads the data files
 * and the export; this module only compares them.
 *
 * The English sentence an exercise is built from must equal the Tatoeba text:
 * - translation_choice: `sentence`
 * - cloze: `sentence` with `___` replaced by the first answer
 * - word_order: the first `accepted` sentence
 * - translate_write: one of the sentences its `accepted` answer patterns stand for
 */
import { expandAccepted } from "@english-learn/domain";
import type { Sentence } from "./tatoeba";

/** Loose view of `Source`: only `kind: "tatoeba"` sources carry the other fields. */
interface SourceLike {
  kind: string;
  sentenceId?: number;
  author?: string;
  license?: string;
}

export interface ExerciseLike {
  id?: string;
  type: string;
  source: SourceLike;
  sentence?: string;
  answers?: string[];
  accepted?: string[];
}

export interface AttributionError {
  id: string;
  message: string;
}

/** English sentences an exercise presents; any of them may carry the attribution. */
export function englishCandidates(ex: ExerciseLike): string[] {
  switch (ex.type) {
    case "translation_choice":
      return ex.sentence ? [ex.sentence] : [];
    case "cloze":
      return ex.sentence && ex.answers?.[0] ? [ex.sentence.replace("___", ex.answers[0])] : [];
    case "word_order":
      return ex.accepted?.slice(0, 1) ?? [];
    case "translate_write":
      return [...expandAccepted(ex.accepted ?? [])];
    default:
      return [];
  }
}

export function checkAttribution(
  ex: ExerciseLike,
  english: ReadonlyMap<number, Sentence>,
): AttributionError[] {
  if (ex.source.kind !== "tatoeba") return [];
  const id = ex.id ?? "(placement)";
  const { sentenceId, author } = ex.source;
  if (sentenceId === undefined || author === undefined) {
    return [{ id, message: "tatoeba source needs sentenceId and author" }];
  }
  const s = english.get(sentenceId);
  if (!s) return [{ id, message: `English sentence #${sentenceId} not found in the export` }];
  const errors: AttributionError[] = [];
  if (s.author !== author) {
    errors.push({
      id,
      message: `author is "${author}" but #${sentenceId} is owned by "${s.author}"`,
    });
  }
  const texts = englishCandidates(ex);
  if (!texts.includes(s.text)) {
    errors.push({ id, message: `#${sentenceId} is "${s.text}", not quoted by the exercise` });
  }
  return errors;
}

/** Collects every exercise (lesson exercises and embedded placement exercises) from a content file. */
export function exercisesOf(file: unknown): ExerciseLike[] {
  if (typeof file !== "object" || file === null) return [];
  const f = file as {
    exercises?: ExerciseLike[];
    placement?: { id: string; exercise: ExerciseLike }[];
  };
  return [...(f.exercises ?? []), ...(f.placement ?? []).map((q) => ({ ...q.exercise, id: q.id }))];
}
