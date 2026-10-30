// Tests for the production export checks (Node's built-in test runner: `node --test scripts/`).
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { buildServiceWorker } from "./build-service-worker.mjs";
import { findProblems } from "./check-prod-bundle.mjs";

const MANIFEST = JSON.stringify({ name: "English Learn", start_url: "/", icons: [] });

describe("check-prod-bundle", () => {
  let dir;

  async function write(path, body) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), body);
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "check-prod-test-"));
    await write("index.html", '<link rel="manifest" href="/manifest.webmanifest" />');
    await write("manifest.webmanifest", MANIFEST);
    await write("_expo/static/js/web/entry-1.js", "console.log('app');");
    await write("assets/expo-sqlite/wa-sqlite.abc.wasm", "wasm");
    await buildServiceWorker(dir);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("accepts a production export with its service worker and manifest", async () => {
    assert.deepEqual(await findProblems(dir), []);
  });

  it("finds test-only code", async () => {
    await write("_expo/static/js/web/entry-1.js", 'p.get("today")');
    await buildServiceWorker(dir);
    assert.deepEqual(await findProblems(dir), [
      `${join(dir, "_expo/static/js/web/entry-1.js")}: contains test-only code (get("today"))`,
    ]);
  });

  it("finds the e2e played-sounds log", async () => {
    await write("_expo/static/js/web/entry-2.js", "g.__e2e.playedSounds.push(n)");
    await buildServiceWorker(dir);
    assert.deepEqual(await findProblems(dir), [
      `${join(dir, "_expo/static/js/web/entry-2.js")}: contains test-only code (playedSounds)`,
    ]);
  });

  it("finds the e2e settings-writes hook", async () => {
    await write("_expo/static/js/web/entry-3.js", "g.__e2e.settingsWritesSettled=()=>p");
    await buildServiceWorker(dir);
    assert.deepEqual(await findProblems(dir), [
      `${join(dir, "_expo/static/js/web/entry-3.js")}: contains test-only code (settingsWritesSettled)`,
    ]);
  });

  it("requires the service worker", async () => {
    await rm(join(dir, "sw.js"));
    assert.deepEqual(await findProblems(dir), ["sw.js is missing"]);
  });

  it("requires the service worker to precache the shell, the SQLite WASM and the manifest", async () => {
    await write("sw.js", "self.addEventListener('fetch', () => {});");
    assert.deepEqual(await findProblems(dir), [
      'sw.js does not precache "/"',
      "sw.js does not precache the SQLite WASM",
      'sw.js does not precache "/manifest.webmanifest"',
    ]);
  });

  it("flags a stale service worker that does not match the export", async () => {
    await write("_expo/static/js/web/entry-1.js", "console.log('changed');");
    assert.deepEqual(await findProblems(dir), [
      "sw.js is stale: rebuild it with scripts/build-service-worker.mjs",
    ]);
  });

  it("requires a valid, linked web app manifest", async () => {
    await write("manifest.webmanifest", "{ not json");
    await write("index.html", "<title>no manifest</title>");
    await buildServiceWorker(dir);
    assert.deepEqual(await findProblems(dir), [
      "manifest.webmanifest is not valid JSON",
      "index.html does not link /manifest.webmanifest",
    ]);
  });
});
