/**
 * Content validation CLI (`pnpm validate:content`).
 *
 * `main(dir)` loads every `*.json` under `dir`, validates each file against the
 * zod schema, then runs the semantic rules over the whole corpus. It returns a
 * list of errors and never throws.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  validateCorpus,
  validateSchema,
  type LoadedFile,
  type ValidationError,
} from "../src/validate";

const DEFAULT_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((p) => p.split("\\").join("/"))
    .filter((p) => p.endsWith(".json") && statSync(join(dir, p)).isFile())
    .sort();
}

export function main(dir: string = DEFAULT_DATA_DIR): ValidationError[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return [{ file: dir, path: "(root)", message: "content directory does not exist" }];
  }
  const files = listJsonFiles(dir);
  if (files.length === 0) {
    return [{ file: dir, path: "(root)", message: "no content files found" }];
  }

  const errors: ValidationError[] = [];
  const loaded: LoadedFile[] = [];
  for (const file of files) {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch (e) {
      errors.push({
        file,
        path: "(root)",
        message: `invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }
    const result = validateSchema(file, json);
    errors.push(...result.errors);
    if (result.data) loaded.push({ file, data: result.data });
  }
  // Semantic rules only make sense on a structurally valid corpus.
  if (errors.length === 0) errors.push(...validateCorpus(loaded));
  return errors;
}

export function formatErrors(errors: readonly ValidationError[]): string {
  return errors.map((e) => `${e.file}  ${e.path}  ${e.message}`).join("\n");
}

export function run(
  dir: string = DEFAULT_DATA_DIR,
  log: (line: string) => void = console.error,
): { code: 0 | 1 } {
  const errors = main(dir);
  if (errors.length === 0) {
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
