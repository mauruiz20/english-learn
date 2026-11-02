// Tests for the service worker logic (Node's built-in test runner: `node --test scripts/`).
// The worker runs against a fake ServiceWorkerGlobalScope: Node provides Request, Response,
// Headers and crypto.subtle; the Cache API and the events are faked below.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import { serviceWorker } from "./service-worker.mjs";

const ORIGIN = "https://english.example";
const SHELL_HTML = "<!doctype html><title>English Learn</title>";
const ENTRY_JS = "console.log('entry');";
const WAV = Buffer.from("RIFF....WAVEfmt 0123456789");

function revision(body) {
  return createHash("sha256").update(body).digest("hex").slice(0, 16);
}

const FILES = {
  "/": { body: SHELL_HTML, type: "text/html; charset=utf-8" },
  "/_expo/static/js/web/entry-abc.js": { body: ENTRY_JS, type: "text/javascript" },
  "/assets/sounds/tap.123.wav": { body: WAV, type: "audio/wav" },
};
const PRECACHE = Object.entries(FILES).map(([url, { body }]) => ({
  url,
  revision: revision(body),
}));

class FakeCache {
  entries = new Map();
  async match(request) {
    const key = typeof request === "string" ? new URL(request, ORIGIN).href : request.url;
    return this.entries.get(key)?.clone();
  }
  async put(request, response) {
    const key = typeof request === "string" ? new URL(request, ORIGIN).href : request.url;
    this.entries.set(key, response.clone());
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
}

class FakeCacheStorage {
  caches = new Map();
  async open(name) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name);
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name) {
    return this.caches.delete(name);
  }
}

/** A fake ServiceWorkerGlobalScope whose network serves FILES with the isolation headers. */
function createScope({ online = true, files = FILES } = {}) {
  const listeners = {};
  const scope = {
    online,
    fetched: [],
    skipWaitingCalls: 0,
    claimCalls: 0,
    location: { origin: ORIGIN },
    caches: new FakeCacheStorage(),
    clients: { claim: async () => void scope.claimCalls++ },
    skipWaiting: async () => void scope.skipWaitingCalls++,
    addEventListener: (type, listener) => (listeners[type] = listener),
    fetch: async (input) => {
      const request = input instanceof Request ? input : new Request(new URL(input, ORIGIN));
      const { pathname } = new URL(request.url);
      scope.fetched.push(pathname);
      if (!scope.online) throw new TypeError("Failed to fetch");
      const file = files[pathname] ?? (request.mode === "navigate" ? files["/"] : undefined);
      if (file === undefined) return new Response("Not found", { status: 404 });
      return new Response(file.body, {
        headers: {
          "Content-Type": file.type,
          "Cross-Origin-Embedder-Policy": "require-corp",
          "Cross-Origin-Opener-Policy": "same-origin",
        },
      });
    },
    async dispatch(type, init = {}) {
      let response;
      let work = Promise.resolve();
      listeners[type]({
        ...init,
        waitUntil: (promise) => (work = promise),
        respondWith: (promise) => (response = promise),
      });
      await work;
      return response === undefined ? undefined : await response;
    },
    request(path, init) {
      return scope.dispatch("fetch", { request: new Request(new URL(path, ORIGIN), init) });
    },
  };
  return scope;
}

/** A navigation request (`mode: "navigate"` cannot be set through the Request constructor). */
function navigation(path) {
  const request = new Request(new URL(path, ORIGIN), { headers: { Accept: "text/html" } });
  Object.defineProperty(request, "mode", { value: "navigate" });
  return request;
}

function isolated(response) {
  return (
    response.headers.get("Cross-Origin-Embedder-Policy") === "require-corp" &&
    response.headers.get("Cross-Origin-Opener-Policy") === "same-origin"
  );
}

describe("service worker", () => {
  let scope;

  beforeEach(async () => {
    scope = createScope();
    serviceWorker(scope, { version: "v1", precache: PRECACHE });
  });

  describe("install", () => {
    it("precaches every listed file into the version's cache", async () => {
      await scope.dispatch("install");
      assert.deepEqual(await scope.caches.keys(), ["english-learn-precache-v1"]);
      const cache = await scope.caches.open("english-learn-precache-v1");
      assert.equal(await (await cache.match("/")).text(), SHELL_HTML);
      assert.equal(await (await cache.match("/_expo/static/js/web/entry-abc.js")).text(), ENTRY_JS);
    });

    it("bypasses the HTTP cache when downloading", async () => {
      const requests = [];
      const fetch = scope.fetch;
      scope.fetch = (request) => (requests.push(request), fetch(request));
      await scope.dispatch("install");
      assert.deepEqual(new Set(requests.map((request) => request.cache)), new Set(["reload"]));
    });

    it("fails, so the browser retries later, when a file does not match its revision", async () => {
      const stale = createScope({
        files: { ...FILES, "/": { body: "<!doctype html>other deploy", type: "text/html" } },
      });
      serviceWorker(stale, { version: "v1", precache: PRECACHE });
      await assert.rejects(stale.dispatch("install"), /revision/);
    });

    it("fails when a file is missing", async () => {
      const missing = createScope({ files: { "/": FILES["/"] } });
      serviceWorker(missing, { version: "v1", precache: PRECACHE });
      await assert.rejects(missing.dispatch("install"), /404/);
    });

    it("reuses unchanged files from the previous version instead of downloading them", async () => {
      await scope.dispatch("install");
      const next = createScope();
      next.caches = scope.caches;
      const changedShell = "<!doctype html><title>English Learn v2</title>";
      next.fetch = createScope({
        files: { ...FILES, "/": { body: changedShell, type: "text/html" } },
      }).fetch;
      const fetched = [];
      const fetch = next.fetch;
      next.fetch = (request) => (fetched.push(new URL(request.url).pathname), fetch(request));
      const precache = PRECACHE.map((entry) =>
        entry.url === "/" ? { url: "/", revision: revision(changedShell) } : entry,
      );
      serviceWorker(next, { version: "v2", precache });

      await next.dispatch("install");

      assert.deepEqual(fetched, ["/"]);
      const cache = await next.caches.open("english-learn-precache-v2");
      assert.equal(await (await cache.match("/")).text(), changedShell);
      assert.equal(await (await cache.match("/_expo/static/js/web/entry-abc.js")).text(), ENTRY_JS);
    });

    it("does not skip waiting on its own: an update waits for the learner", async () => {
      await scope.dispatch("install");
      assert.equal(scope.skipWaitingCalls, 0);
    });
  });

  describe("activate", () => {
    it("deletes the caches of other versions and keeps unrelated caches", async () => {
      await scope.caches.open("english-learn-precache-v0");
      await scope.caches.open("someone-else");
      await scope.dispatch("install");
      await scope.dispatch("activate");
      assert.deepEqual(await scope.caches.keys(), ["someone-else", "english-learn-precache-v1"]);
    });

    it("takes control of the open pages", async () => {
      await scope.dispatch("activate");
      assert.equal(scope.claimCalls, 1);
    });
  });

  describe("message", () => {
    it("activates the waiting version when the learner asks for the update", async () => {
      await scope.dispatch("message", { data: { type: "SKIP_WAITING" } });
      assert.equal(scope.skipWaitingCalls, 1);
    });

    it("ignores other messages", async () => {
      await scope.dispatch("message", { data: "hello" });
      await scope.dispatch("message", { data: null });
      assert.equal(scope.skipWaitingCalls, 0);
    });
  });

  describe("fetch", () => {
    beforeEach(async () => {
      await scope.dispatch("install");
      scope.fetched = [];
    });

    it("serves navigations from the network while online", async () => {
      const response = await scope.dispatch("fetch", { request: navigation("/review") });
      assert.deepEqual(scope.fetched, ["/review"]);
      assert.equal(await response.text(), SHELL_HTML);
      assert.ok(isolated(response));
    });

    it("falls back to the cached app shell for any navigation when offline, dotted ids included", async () => {
      scope.online = false;
      for (const path of ["/", "/lesson/a2.food.lesson-001", "/review?today=2030-01-03"]) {
        const response = await scope.dispatch("fetch", { request: navigation(path) });
        assert.equal(response.status, 200, path);
        assert.equal(await response.text(), SHELL_HTML, path);
        assert.ok(isolated(response), path);
      }
    });

    it("serves the Google sign-in callback as the app shell and never caches it", async () => {
      // Google's redirect: the ID token is in the fragment, which never reaches the worker.
      const request = navigation("/auth/callback#id_token=secret&state=s1");
      assert.equal(new URL(request.url).hash, "#id_token=secret&state=s1");
      const response = await scope.dispatch("fetch", { request });
      assert.equal(await response.text(), SHELL_HTML);
      assert.deepEqual(scope.fetched, ["/auth/callback"]);

      scope.online = false;
      const offline = await scope.dispatch("fetch", { request: navigation("/auth/callback") });
      assert.equal(await offline.text(), SHELL_HTML);

      const cache = await scope.caches.open("english-learn-precache-v1");
      assert.equal(await cache.match("/auth/callback"), undefined);
    });

    it("serves the progress import page as the app shell and never caches it", async () => {
      // The old web address sends the transfer token in the fragment: never seen by the worker.
      const request = navigation("/importar#t=secret-transfer-token");
      const response = await scope.dispatch("fetch", { request });
      assert.equal(await response.text(), SHELL_HTML);
      assert.deepEqual(scope.fetched, ["/importar"]);
      assert.ok(isolated(response));

      scope.online = false;
      const offline = await scope.dispatch("fetch", { request: navigation("/importar") });
      assert.equal(await offline.text(), SHELL_HTML);

      const cache = await scope.caches.open("english-learn-precache-v1");
      assert.equal(await cache.match("/importar"), undefined);
    });

    it("leaves API calls (another origin, POST) to the browser", async () => {
      const api = new Request("https://english-api.maumar.com.ar/v1/sync", {
        method: "POST",
        body: "{}",
      });
      assert.equal(await scope.dispatch("fetch", { request: api }), undefined);
      const refresh = new Request("https://english-api.maumar.com.ar/v1/auth/refresh");
      assert.equal(await scope.dispatch("fetch", { request: refresh }), undefined);
      assert.deepEqual(scope.fetched, []);
    });

    it("falls back to the app shell when the host fails (5xx)", async () => {
      scope.fetch = async () => new Response("Bad gateway", { status: 502 });
      const response = await scope.dispatch("fetch", { request: navigation("/") });
      assert.equal(await response.text(), SHELL_HTML);
    });

    it("falls back to the app shell when the network hangs", async () => {
      const slow = createScope();
      serviceWorker(slow, { version: "v1", precache: PRECACHE, navigationTimeoutMs: 20 });
      await slow.dispatch("install");
      slow.fetch = () => new Promise(() => {});
      const response = await slow.dispatch("fetch", { request: navigation("/") });
      assert.equal(await response.text(), SHELL_HTML);
    });

    it("adds the cross-origin isolation headers when a response lacks them", async () => {
      // E.g. a cached response whose headers a browser did not keep, or a host misconfiguration.
      scope.fetch = async () =>
        new Response(SHELL_HTML, { headers: { "Content-Type": "text/html" } });
      const response = await scope.dispatch("fetch", { request: navigation("/") });
      assert.ok(isolated(response));
      assert.equal(response.headers.get("Content-Type"), "text/html");
      assert.equal(await response.text(), SHELL_HTML);
    });

    it("serves precached assets from the cache without touching the network", async () => {
      scope.online = false;
      const response = await scope.request("/_expo/static/js/web/entry-abc.js");
      assert.equal(await response.text(), ENTRY_JS);
      assert.equal(response.headers.get("Content-Type"), "text/javascript");
      assert.ok(isolated(response));
      assert.deepEqual(scope.fetched, []);
    });

    it("ignores the query string of precached assets", async () => {
      scope.online = false;
      const response = await scope.request("/_expo/static/js/web/entry-abc.js?platform=web");
      assert.equal(await response.text(), ENTRY_JS);
    });

    it("answers byte ranges of cached media (Safari requests audio in ranges)", async () => {
      scope.online = false;
      const response = await scope.request("/assets/sounds/tap.123.wav", {
        headers: { Range: "bytes=4-7" },
      });
      assert.equal(response.status, 206);
      assert.equal(response.headers.get("Content-Range"), `bytes 4-7/${WAV.length}`);
      assert.equal(response.headers.get("Content-Length"), "4");
      assert.equal(response.headers.get("Content-Type"), "audio/wav");
      assert.ok(isolated(response));
      assert.equal(await response.text(), "....");

      const open = await scope.request("/assets/sounds/tap.123.wav", {
        headers: { Range: "bytes=0-" },
      });
      assert.equal(open.status, 206);
      assert.equal(open.headers.get("Content-Range"), `bytes 0-${WAV.length - 1}/${WAV.length}`);
      assert.deepEqual(Buffer.from(await open.arrayBuffer()), WAV);
    });

    it("answers 416 to a range past the end", async () => {
      const response = await scope.request("/assets/sounds/tap.123.wav", {
        headers: { Range: `bytes=${WAV.length + 10}-` },
      });
      assert.equal(response.status, 416);
      assert.equal(response.headers.get("Content-Range"), `bytes */${WAV.length}`);
    });

    it("leaves other requests to the browser", async () => {
      assert.equal(await scope.request("/api/unknown.json"), undefined);
      assert.equal(await scope.request("https://other.example/font.ttf"), undefined);
      assert.equal(
        await scope.request("/_expo/static/js/web/entry-abc.js", { method: "POST", body: "x" }),
        undefined,
      );
    });
  });
});
