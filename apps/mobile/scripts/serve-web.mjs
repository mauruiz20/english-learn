#!/usr/bin/env node
// Serves the static web export (dist/) like a production host would: SPA fallback to
// index.html plus the cross-origin isolation headers expo-sqlite needs (SharedArrayBuffer).
// Usage: node scripts/serve-web.mjs [--port 4173] [--dir dist-e2e] [--e2e-hooks]   (or PORT=4173)
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ISOLATION_HEADERS = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function resolveFile(dir, urlPath) {
  const candidate = normalize(join(dir, decodeURIComponent(urlPath)));
  if (candidate !== dir && !candidate.startsWith(dir + sep)) return null;
  try {
    const info = await stat(candidate);
    if (info.isFile()) return candidate;
    if (info.isDirectory()) {
      const index = join(candidate, "index.html");
      if ((await stat(index)).isFile()) return index;
    }
  } catch {
    // Not found: fall through to the SPA fallback.
  }
  return null;
}

/**
 * SPA fallback for page navigations only (the browser asks for HTML), whatever the path looks
 * like: lesson ids contain dots (`/lesson/a2.food.lesson-001`). Missing assets stay 404.
 */
function isNavigation(req) {
  return (req.headers.accept ?? "").includes("text/html");
}

/**
 * E2E hook (`--e2e-hooks`): a request for /sw.js with the cookie `e2e-sw-version=N` gets the
 * worker plus a comment, i.e. different bytes, which the browser treats as a new deploy. A
 * cookie is per browser profile, so one test can simulate an update without touching others.
 */
function e2eServiceWorkerVersion(req, pathname) {
  if (pathname !== "/sw.js") return null;
  return /(?:^|;\s*)e2e-sw-version=(\w+)/.exec(req.headers.cookie ?? "")?.[1] ?? null;
}

/** Creates (does not start) the server for the export in `dir`. */
export function createStaticServer({ dir, e2eHooks = false }) {
  const root = resolve(dir);
  return createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    let file;
    try {
      file = await resolveFile(root, pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (file === null && isNavigation(req)) file = join(root, "index.html");
    if (file === null) {
      res.writeHead(404, ISOLATION_HEADERS).end("Not found");
      return;
    }
    const headers = {
      ...ISOLATION_HEADERS,
      "Content-Type": MIME_TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    };
    if (req.method === "HEAD") {
      res.writeHead(200, headers).end();
      return;
    }
    const swVersion = e2eHooks ? e2eServiceWorkerVersion(req, pathname) : null;
    if (swVersion !== null) {
      const source = await readFile(file, "utf8");
      res.writeHead(200, headers).end(`${source}\n// e2e-sw-version ${swVersion}\n`);
      return;
    }
    // Headers go out only once the file is open, so an open error can still answer 500.
    const stream = createReadStream(file);
    stream.once("open", () => {
      res.writeHead(200, headers);
      stream.pipe(res);
    });
    // A read error (file removed or unreadable after `stat`) must not crash the server.
    stream.on("error", (error) => {
      console.error(`Failed to read ${file}`, error);
      if (res.headersSent) res.destroy(error);
      else res.writeHead(500, ISOLATION_HEADERS).end("Internal server error");
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirFlag = process.argv.indexOf("--dir");
  const dir = fileURLToPath(
    new URL(`../${dirFlag === -1 ? "dist" : process.argv[dirFlag + 1]}`, import.meta.url),
  );
  const portFlag = process.argv.indexOf("--port");
  const port = Number(portFlag === -1 ? (process.env.PORT ?? 4173) : process.argv[portFlag + 1]);
  const e2eHooks = process.argv.includes("--e2e-hooks");
  createStaticServer({ dir, e2eHooks }).listen(port, () => {
    console.log(`Serving ${resolve(dir)} at http://localhost:${port}`);
  });
}
