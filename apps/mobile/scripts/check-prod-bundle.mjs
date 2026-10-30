#!/usr/bin/env node
// Checks the production web export (dist/):
// - it contains no test-only code: the e2e `?today=` clock override must only exist in builds
//   exported with EXPO_PUBLIC_E2E=1 (dist-e2e/);
// - it is an installable, offline-capable PWA: sw.js is there, up to date with the export and
//   precaches the app shell, the SQLite WASM and the manifest; the manifest is valid and linked.
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { precacheEntries, renderServiceWorker, versionOf } from "./build-service-worker.mjs";

const FORBIDDEN = ['get("today")', "EXPO_PUBLIC_E2E"];

async function* jsFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* jsFiles(path);
    else if (entry.name.endsWith(".js")) yield path;
  }
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/** Every problem found in the export in `dir` (empty when it is fine). */
export async function findProblems(dir) {
  const problems = [];
  for await (const file of jsFiles(dir)) {
    const source = await readFile(file, "utf8");
    for (const marker of FORBIDDEN) {
      if (source.includes(marker)) problems.push(`${file}: contains test-only code (${marker})`);
    }
  }

  const sw = await readOptional(join(dir, "sw.js"));
  if (sw === null) {
    problems.push("sw.js is missing");
  } else {
    const precache = await precacheEntries(dir);
    const missing = [];
    if (!sw.includes('"url":"/"')) missing.push('sw.js does not precache "/"');
    if (!/"url":"[^"]+\.wasm"/.test(sw)) missing.push("sw.js does not precache the SQLite WASM");
    if (!sw.includes('"url":"/manifest.webmanifest"')) {
      missing.push('sw.js does not precache "/manifest.webmanifest"');
    }
    problems.push(...missing);
    if (
      missing.length === 0 &&
      sw !== renderServiceWorker({ version: versionOf(precache), precache })
    ) {
      problems.push("sw.js is stale: rebuild it with scripts/build-service-worker.mjs");
    }
  }

  const manifest = await readOptional(join(dir, "manifest.webmanifest"));
  if (manifest === null) problems.push("manifest.webmanifest is missing");
  else {
    try {
      JSON.parse(manifest);
    } catch {
      problems.push("manifest.webmanifest is not valid JSON");
    }
  }
  const html = (await readOptional(join(dir, "index.html"))) ?? "";
  if (!html.includes('<link rel="manifest" href="/manifest.webmanifest"')) {
    problems.push("index.html does not link /manifest.webmanifest");
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
  const problems = await findProblems(dist);
  if (problems.length > 0) {
    console.error(`The production web build is not ready:\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log("Production web build is free of e2e hooks and ships the service worker + manifest.");
}
