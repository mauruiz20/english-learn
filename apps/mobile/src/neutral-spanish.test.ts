import { findVoseo } from "@english-learn/content";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// UI copy is neutral Spanish with tú ("inicia", "puedes", "tienes"), never voseo ("iniciá",
// "podés", "tenés"). Scans every source and e2e file (tests assert the copy too).

const APP_DIR = join(__dirname, "..");

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(ts|tsx)$/.test(entry) && path !== __filename) yield path;
  }
}

test("UI copy uses tú, never voseo", () => {
  const found: string[] = [];
  for (const file of [...sourceFiles(join(APP_DIR, "src")), ...sourceFiles(join(APP_DIR, "e2e"))]) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        const words = findVoseo(line);
        if (words.length > 0) found.push(`${relative(APP_DIR, file)}:${i + 1} ${words.join(", ")}`);
      });
  }
  expect(found).toEqual([]);
});
