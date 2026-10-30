// The web app's service worker. `scripts/build-service-worker.mjs` serializes `serviceWorker`
// (`Function.prototype.toString`) into dist/sw.js and calls it with `self` and the precache
// manifest generated from the export, so the function must stay self-contained: no imports and
// no references to anything outside its body.
//
// Strategy:
// - install: download every exported file (cache: "reload"), verify its content hash and store
//   it in `english-learn-precache-<version>`; files whose hash did not change are copied from
//   the previous version's cache. Any failure fails the install (the browser retries later), so a
//   cache is always one consistent build. It does NOT skip waiting: the page asks the learner.
// - activate: delete other versions' caches, then claim the open pages.
// - navigations: network first (fresh deploys reach online learners), falling back to the
//   cached app shell when offline, on a 5xx or after a timeout. Decided by `request.mode`, never
//   by the path: lesson ids contain dots (`/lesson/a2.food.lesson-001`).
// - precached files: cache first (they are content-hashed), with byte-range support for media.
// - everything else: left to the browser.
// Every response it returns carries COOP/COEP, so the page stays cross-origin isolated
// (SharedArrayBuffer for expo-sqlite) when it is served from the cache.

/**
 * @param {ServiceWorkerGlobalScope} sw
 * @param {{ version: string, precache: { url: string, revision: string }[],
 *   navigationTimeoutMs?: number }} config
 */
export function serviceWorker(sw, config) {
  const CACHE_PREFIX = "english-learn-precache-";
  const cacheName = CACHE_PREFIX + config.version;
  const SHELL = "/";
  const REVISION_HEADER = "X-Precache-Revision";
  const ISOLATION_HEADERS = {
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
  const navigationTimeoutMs = config.navigationTimeoutMs ?? 4000;
  const revisions = new Map(config.precache.map((entry) => [entry.url, entry.revision]));

  /** Same response with COOP/COEP; rebuilt only when needed (or when it was redirected). */
  function withIsolation(response) {
    if (response.type === "opaque" || response.type === "opaqueredirect") return response;
    const complete = Object.entries(ISOLATION_HEADERS).every(
      ([name, value]) => response.headers.get(name) === value,
    );
    if (complete && !response.redirected) return response;
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(ISOLATION_HEADERS)) headers.set(name, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  async function sha256Prefix(buffer) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  }

  async function previousCopy(url, revision) {
    for (const name of await sw.caches.keys()) {
      if (!name.startsWith(CACHE_PREFIX) || name === cacheName) continue;
      const cached = await (await sw.caches.open(name)).match(url);
      if (cached && cached.headers.get(REVISION_HEADER) === revision) return cached;
    }
    return undefined;
  }

  async function download(url, revision) {
    const response = await sw.fetch(
      new Request(new URL(url, sw.location.origin), { cache: "reload" }),
    );
    if (!response.ok) throw new Error(`Precaching ${url} failed: HTTP ${response.status}`);
    const body = await response.arrayBuffer();
    const actual = await sha256Prefix(body);
    if (actual !== revision) {
      throw new Error(`Precaching ${url} failed: revision ${actual}, expected ${revision}`);
    }
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(ISOLATION_HEADERS)) headers.set(name, value);
    headers.set(REVISION_HEADER, revision);
    return new Response(body, { status: 200, headers });
  }

  async function precache() {
    const cache = await sw.caches.open(cacheName);
    await Promise.all(
      config.precache.map(async ({ url, revision }) => {
        const existing = await cache.match(url);
        if (existing && existing.headers.get(REVISION_HEADER) === revision) return;
        await cache.put(
          url,
          (await previousCopy(url, revision)) ?? (await download(url, revision)),
        );
      }),
    );
  }

  async function cleanUpAndClaim() {
    for (const name of await sw.caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== cacheName) await sw.caches.delete(name);
    }
    await sw.clients.claim();
  }

  async function cachedShell() {
    const shell = await (await sw.caches.open(cacheName)).match(SHELL);
    return shell ? withIsolation(shell) : undefined;
  }

  async function navigate(request) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Navigation timed out")), navigationTimeoutMs);
    });
    try {
      const response = await Promise.race([sw.fetch(request), timeout]);
      if (response.status >= 500) return (await cachedShell()) ?? withIsolation(response);
      return withIsolation(response);
    } catch (error) {
      const shell = await cachedShell();
      if (shell) return shell;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** A 206 slice of a cached response for `Range: bytes=start-[end]` (single range only). */
  async function partial(response, range) {
    const body = await response.arrayBuffer();
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    const size = body.byteLength;
    let start = match && match[1] !== "" ? Number(match[1]) : NaN;
    let end = match && match[2] !== "" ? Number(match[2]) : size - 1;
    if (match && match[1] === "" && match[2] !== "") {
      // Suffix range: the last N bytes.
      start = Math.max(0, size - Number(match[2]));
      end = size - 1;
    }
    const headers = new Headers(response.headers);
    if (!(start <= end) || start >= size) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    end = Math.min(end, size - 1);
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(body.slice(start, end + 1), { status: 206, headers });
  }

  async function cacheFirst(request, pathname) {
    const cached = await (await sw.caches.open(cacheName)).match(pathname);
    if (!cached) return withIsolation(await sw.fetch(request));
    const range = request.headers.get("Range");
    return withIsolation(range ? await partial(cached, range) : cached);
  }

  sw.addEventListener("install", (event) => event.waitUntil(precache()));

  sw.addEventListener("activate", (event) => event.waitUntil(cleanUpAndClaim()));

  sw.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") event.waitUntil(sw.skipWaiting());
  });

  sw.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== sw.location.origin) return;
    if (request.mode === "navigate") {
      event.respondWith(navigate(request));
    } else if (url.pathname !== SHELL && revisions.has(url.pathname)) {
      event.respondWith(cacheFirst(request, url.pathname));
    }
  });
}
