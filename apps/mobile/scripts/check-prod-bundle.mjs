#!/usr/bin/env node
// Fails if the production web export (dist/) contains test-only code: the e2e `?today=` clock
// override must only exist in builds exported with EXPO_PUBLIC_E2E=1 (dist-e2e/).
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const FORBIDDEN = ['get("today")', "EXPO_PUBLIC_E2E"];

async function* jsFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* jsFiles(path);
    else if (entry.name.endsWith(".js")) yield path;
  }
}

const leaks = [];
for await (const file of jsFiles(DIST)) {
  const source = await readFile(file, "utf8");
  for (const marker of FORBIDDEN) if (source.includes(marker)) leaks.push(`${file}: ${marker}`);
}
if (leaks.length > 0) {
  console.error(`Test-only code found in the production web build:\n${leaks.join("\n")}`);
  process.exit(1);
}
console.log("Production web build is free of e2e hooks.");
