import { ContentFileSchema, type ContentFile } from "../schema";
import { formatPath } from "./helpers";
import type { ValidationError } from "./types";

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
