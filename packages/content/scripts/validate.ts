/**
 * Content validation CLI (`pnpm validate:content`).
 *
 * `main(dir)` loads every `*.json` under `dir`, validates each file against the
 * zod schema (and for duplicate JSON keys), then runs the semantic rules over
 * the whole corpus. If any file failed, only the reference-free rules run (on
 * the files that parsed). It returns a list of errors and never throws.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  findDuplicateKeys,
  glossaryReport,
  isLevelIntroFile,
  validateCorpus,
  validateLevelIntro,
  validateLocal,
  validateSchema,
  type LoadedFile,
  type ValidationError,
} from "../src/validate";

const DEFAULT_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

export function listJsonFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((p) => p.split("\\").join("/"))
    .filter((p) => p.endsWith(".json") && statSync(join(dir, p)).isFile())
    .sort();
}

export function main(dir: string = DEFAULT_DATA_DIR): ValidationError[] {
  return load(dir).errors;
}

/** Loads and validates `dir`; `loaded` holds every file that passed the schema. */
export function load(dir: string = DEFAULT_DATA_DIR): {
  errors: ValidationError[];
  loaded: LoadedFile[];
} {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return {
      errors: [{ file: dir, path: "(root)", message: "content directory does not exist" }],
      loaded: [],
    };
  }
  const files = listJsonFiles(dir);
  if (files.length === 0) {
    return {
      errors: [{ file: dir, path: "(root)", message: "no content files found" }],
      loaded: [],
    };
  }

  const errors: ValidationError[] = [];
  const loaded: LoadedFile[] = [];
  for (const file of files) {
    const text = readFileSync(join(dir, file), "utf8");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      errors.push({
        file,
        path: "(root)",
        message: `invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }
    for (const { path, key } of findDuplicateKeys(text)) {
      errors.push({
        file,
        path,
        message: `duplicate key "${key}" (JSON.parse keeps only the last value)`,
      });
    }
    // A level intro has its own schema and is not part of the content corpus.
    if (isLevelIntroFile(file)) {
      errors.push(...validateLevelIntro(file, json));
      continue;
    }
    const result = validateSchema(file, json);
    errors.push(...result.errors);
    if (result.data) loaded.push({ file, data: result.data });
  }
  // Cross-file rules need a complete corpus; reference-free rules still run on
  // every file that parsed, so one broken file does not hide other mistakes.
  errors.push(...(errors.length === 0 ? validateCorpus(loaded) : validateLocal(loaded)));
  return { errors, loaded };
}

export function formatErrors(errors: readonly ValidationError[]): string {
  return errors.map((e) => `${e.file}  ${e.path}  ${e.message}`).join("\n");
}

export function run(
  dir: string = DEFAULT_DATA_DIR,
  log: (line: string) => void = console.error,
): { code: 0 | 1 } {
  const { errors, loaded } = load(dir);
  if (errors.length === 0) {
    const g = glossaryReport(loaded);
    log(
      `glossary: ${g.entries} entries (${g.phrases} phrases), ${g.forms} forms; ` +
        `warning: ${g.unusedForms.length} unused forms`,
    );
    log("content: OK");
    return { code: 0 };
  }
  log(formatErrors(errors));
  log(`content: ${errors.length} error(s)`);
  return { code: 1 };
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  process.exit(run(process.argv[2]).code);
}
