// Tests for the service worker build step (Node's built-in test runner: `node --test scripts/`).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  buildServiceWorker,
  precacheEntries,
  renderServiceWorker,
  versionOf,
} from "./build-service-worker.mjs";

const revision = (body) => createHash("sha256").update(body).digest("hex").slice(0, 16);

describe("build-service-worker", () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "build-sw-test-"));
    const files = {
      "index.html": "<!doctype html>",
      _headers: "/*\n  X: y",
      "metadata.json": "{}",
      "sw.js": "old worker",
      "favicon.ico": "ico",
      "manifest.webmanifest": "{}",
      "_expo/static/js/web/[id]-abc.js": "chunk",
      "_expo/static/js/web/entry-def.js": "entry",
      "_expo/static/js/web/entry-def.js.map": "{}",
      "assets/__node_modules/.pnpm/@expo-google-fonts+caveat@0.4.2/Caveat.123.ttf": "font",
      "assets/assets/sounds/tap.456.wav": "wav",
    };
    for (const [path, body] of Object.entries(files)) {
      await mkdir(join(dir, path, ".."), { recursive: true });
      await writeFile(join(dir, path), body);
    }
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("lists every exported file but the host config, metadata, source maps and the worker", async () => {
    assert.deepEqual(await precacheEntries(dir), [
      { url: "/", revision: revision("<!doctype html>") },
      { url: "/_expo/static/js/web/[id]-abc.js", revision: revision("chunk") },
      { url: "/_expo/static/js/web/entry-def.js", revision: revision("entry") },
      {
        url: "/assets/__node_modules/.pnpm/@expo-google-fonts+caveat@0.4.2/Caveat.123.ttf",
        revision: revision("font"),
      },
      { url: "/assets/assets/sounds/tap.456.wav", revision: revision("wav") },
      { url: "/favicon.ico", revision: revision("ico") },
      { url: "/manifest.webmanifest", revision: revision("{}") },
    ]);
  });

  it("encodes URLs the way browsers request them", async () => {
    await writeFile(join(dir, "a file.png"), "x");
    const urls = (await precacheEntries(dir)).map((entry) => entry.url);
    assert.ok(urls.includes("/a%20file.png"));
  });

  it("derives the version from the content: any changed file gives a new worker", () => {
    const entries = [
      { url: "/", revision: "aaaa" },
      { url: "/x.js", revision: "bbbb" },
    ];
    assert.equal(versionOf(entries), versionOf([...entries]));
    assert.notEqual(
      versionOf(entries),
      versionOf([entries[0], { url: "/x.js", revision: "cccc" }]),
    );
    assert.match(versionOf(entries), /^[0-9a-f]{12}$/);
  });

  it("renders a self-contained classic script that installs the worker on `self`", () => {
    const precache = [{ url: "/", revision: "aaaa" }];
    const source = renderServiceWorker({ version: "v123", precache });
    const listeners = [];
    const self = {
      location: { origin: "https://english.example" },
      addEventListener: (type) => listeners.push(type),
    };
    new Function("self", source)(self);
    assert.deepEqual(listeners.sort(), ["activate", "fetch", "install", "message"]);
    assert.match(source, /"version":"v123"/);
    assert.doesNotMatch(source, /\bexport\b|\bimport\b/);
  });

  it("writes sw.js into the export and reports what it precached", async () => {
    const result = await buildServiceWorker(dir);
    const source = await readFile(join(dir, "sw.js"), "utf8");
    assert.equal(result.files, 7);
    assert.match(source, new RegExp(`"version":"${result.version}"`));
    assert.match(source, /"url":"\/_expo\/static\/js\/web\/entry-def.js"/);
    assert.doesNotMatch(source, /old worker/);

    // Rebuilding the same export gives the same bytes (no spurious update for learners).
    await buildServiceWorker(dir);
    assert.equal(await readFile(join(dir, "sw.js"), "utf8"), source);
  });
});
