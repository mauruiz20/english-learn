import type { LoadedFile, Rule, ValidationError } from "./types";

/**
 * Doubled terminal punctuation: exactly two dots (`"p.m.."`, `"wait.. what"`)
 * or a run of four or more. A three-dot ellipsis (`"where is...?"`) and the
 * ellipsis character are intentional and allowed.
 */
const DOUBLED_DOTS = /(?<!\.)\.\.(?!\.)|\.{4,}/;

const MESSAGE =
  'doubled terminal punctuation (".." as in "p.m..", or four or more dots); use one "." or a three-dot ellipsis';

/** Every string inside `value` with its `a[0].b` path. Ids never contain "..", so scanning them is harmless. */
function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === "string") {
    yield [path, value];
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* strings(value[i], `${path}[${i}]`);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k);
  }
}

/** Rejects doubled terminal punctuation in every text field of every file. */
export const validateTextPunctuation: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    for (const [path, text] of strings(data, "")) {
      if (DOUBLED_DOTS.test(text)) errors.push({ file, path, message: MESSAGE });
    }
  }
  return errors;
};
