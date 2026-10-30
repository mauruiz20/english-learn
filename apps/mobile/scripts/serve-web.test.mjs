// Tests for the static test server (Node's built-in test runner: `node --test scripts/`).
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createStaticServer } from "./serve-web.mjs";

const HTML = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

describe("serve-web", () => {
  let dir;
  let server;
  let origin;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "serve-web-test-"));
    await writeFile(join(dir, "index.html"), "<!doctype html><title>shell</title>");
    await writeFile(join(dir, "sw.js"), "self.addEventListener('fetch', () => {});");
    await writeFile(join(dir, "manifest.webmanifest"), "{}");
    await mkdir(join(dir, "_expo"));
    await writeFile(join(dir, "_expo", "entry-abc.js"), "console.log(1);");
    server = createStaticServer({ dir });
    await new Promise((resolve) => server.listen(0, resolve));
    origin = `http://localhost:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });

  async function get(path, accept = "*/*") {
    const response = await fetch(origin + path, { headers: { Accept: accept } });
    return { response, body: await response.text() };
  }

  it("serves files with the cross-origin isolation headers", async () => {
    const { response, body } = await get("/_expo/entry-abc.js");
    assert.equal(response.status, 200);
    assert.equal(body, "console.log(1);");
    assert.equal(response.headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp");
    assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  });

  it("falls back to index.html for page navigations, dotted paths included", async () => {
    for (const path of ["/", "/review", "/lesson/a2.food.lesson-001", "/lesson/x.y?today=1"]) {
      const { response, body } = await get(path, HTML);
      assert.equal(response.status, 200, path);
      assert.match(body, /<title>shell<\/title>/, path);
      assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp", path);
    }
  });

  it("answers 404 for missing assets that are not navigations", async () => {
    assert.equal((await get("/_expo/missing-123.js")).response.status, 404);
    assert.equal((await get("/lesson/a2.food.lesson-001", "*/*")).response.status, 404);
  });

  it("serves the web app manifest and the service worker with the right types", async () => {
    const manifest = (await get("/manifest.webmanifest")).response;
    assert.equal(manifest.headers.get("content-type"), "application/manifest+json");
    const sw = (await get("/sw.js")).response;
    assert.equal(sw.headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.equal(sw.headers.get("cache-control"), "no-cache");
    assert.equal(sw.headers.get("cross-origin-embedder-policy"), "require-corp");
  });

  it("simulates a new deploy of sw.js for one browser profile (e2e hook, opt-in)", async () => {
    const hooked = createStaticServer({ dir, e2eHooks: true });
    await new Promise((resolve) => hooked.listen(0, resolve));
    try {
      const url = `http://localhost:${hooked.address().port}/sw.js`;
      const plain = await (await fetch(url)).text();
      const bumped = await (await fetch(url, { headers: { Cookie: "e2e-sw-version=2" } })).text();
      assert.equal(plain, "self.addEventListener('fetch', () => {});");
      assert.equal(bumped, `${plain}\n// e2e-sw-version 2\n`);
    } finally {
      await new Promise((resolve) => hooked.close(resolve));
    }
    // Without the opt-in, the cookie changes nothing.
    const response = await fetch(origin + "/sw.js", { headers: { Cookie: "e2e-sw-version=2" } });
    assert.equal(await response.text(), "self.addEventListener('fetch', () => {});");
  });
});
