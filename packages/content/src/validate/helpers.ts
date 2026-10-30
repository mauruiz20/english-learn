import type { Exercise, PlacementExercise } from "../schema";
import type { LoadedFile } from "./types";

export type AnyExercise = Exercise | PlacementExercise;

export interface ExerciseEntry {
  file: string;
  /** Path to the exercise object, e.g. `exercises[1]` or `placement[0].exercise`. */
  path: string;
  exercise: AnyExercise;
}

/** Every exercise in the corpus, including the ones embedded in placement questions. */
export function exerciseEntries(files: readonly LoadedFile[]): ExerciseEntry[] {
  const out: ExerciseEntry[] = [];
  for (const { file, data } of files) {
    (data.exercises ?? []).forEach((exercise, i) =>
      out.push({ file, path: `exercises[${i}]`, exercise }),
    );
    (data.placement ?? []).forEach((q, i) =>
      out.push({ file, path: `placement[${i}].exercise`, exercise: q.exercise }),
    );
  }
  return out;
}

/**
 * Normalization used to compare learner-facing text (options, answers,
 * accepted sentences): Unicode NFC, curly quotes -> straight quotes,
 * lower-cased, whitespace trimmed and collapsed, trailing `.,!?;:` stripped.
 */
export const normalize = (s: string): string =>
  s
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s.,!?;:]+$/, "");

/** Zod issue path -> `a[0].b` notation. */
export function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(root)";
  let out = "";
  for (const seg of path) {
    out += typeof seg === "number" ? `[${seg}]` : out ? `.${String(seg)}` : String(seg);
  }
  return out;
}
