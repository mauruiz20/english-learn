import {
  ContentFileSchema,
  LEVEL_INTRO_FILE,
  LEVELS,
  LevelIntroSchema,
  type ContentFile,
} from "../schema";
import { formatPath } from "./helpers";
import type { ValidationError } from "./types";
import { findVoseo } from "./voseo";

/** Structural (zod) validation of one parsed JSON document. Never throws. */
export function validateSchema(
  file: string,
  json: unknown,
): { data?: ContentFile; errors: ValidationError[] } {
  const result = ContentFileSchema.safeParse(json);
  if (result.success) return { data: result.data, errors: [] };
  return {
    errors: result.error.issues.map((issue) => ({
      file,
      path: formatPath(issue.path),
      message: issue.message,
    })),
  };
}

/** `<level>/level.json` (corpus-relative, posix): a level intro, not a content file. */
export function isLevelIntroFile(file: string): boolean {
  const [dir, name, ...rest] = file.split("/");
  return (
    rest.length === 0 &&
    name === LEVEL_INTRO_FILE &&
    LEVELS.some((level) => level.toLowerCase() === dir)
  );
}

/** A level intro: its schema, its `level` matches the directory, and its Spanish has no voseo. */
export function validateLevelIntro(file: string, json: unknown): ValidationError[] {
  const result = LevelIntroSchema.safeParse(json);
  if (!result.success) {
    return result.error.issues.map((issue) => ({
      file,
      path: formatPath(issue.path),
      message: issue.message,
    }));
  }
  const intro = result.data;
  const errors: ValidationError[] = [];
  const dir = file.split("/")[0] ?? "";
  if (intro.level.toLowerCase() !== dir) {
    errors.push({
      file,
      path: "level",
      message: `level ${intro.level} does not match directory level ${dir.toUpperCase()}`,
    });
  }
  const texts: [string, string][] = [
    ["title", intro.title],
    ...intro.canDo.map((t, i): [string, string] => [`canDo[${i}]`, t]),
    ...intro.topics.map((t, i): [string, string] => [`topics[${i}]`, t]),
  ];
  for (const [path, text] of texts) {
    const found = findVoseo(text);
    if (found.length > 0) {
      errors.push({ file, path, message: `voseo (${found.join(", ")}); use tú forms` });
    }
  }
  return errors;
}
