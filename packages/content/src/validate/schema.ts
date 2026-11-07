import { ContentFileSchema, type ContentFile } from "../schema";
import { formatPath } from "./helpers";
import type { ValidationError } from "./types";

/** `data/<level>/level.json`: a bare `LevelIntro`, loaded as `{ levelIntro }`. */
export const LEVEL_INTRO_FILE = /^(a1|a2|b1|b2|c1)\/level\.json$/;

/** Structural (zod) validation of one parsed JSON document. Never throws. */
export function validateSchema(
  file: string,
  json: unknown,
): { data?: ContentFile; errors: ValidationError[] } {
  const levelIntro = LEVEL_INTRO_FILE.test(file);
  const result = ContentFileSchema.safeParse(levelIntro ? { levelIntro: json } : json);
  if (result.success) return { data: result.data, errors: [] };
  return {
    errors: result.error.issues.map((issue) => ({
      file,
      // A level intro's errors point into the file itself, not into the wrapper.
      path: formatPath(levelIntro ? issue.path.slice(1) : issue.path),
      message: issue.message,
    })),
  };
}
