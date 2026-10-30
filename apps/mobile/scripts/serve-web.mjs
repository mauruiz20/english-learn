#!/usr/bin/env node
// Serves the static web export (dist/) like a production host would: SPA fallback to
// index.html plus the cross-origin isolation headers expo-sqlite needs (SharedArrayBuffer).
// Usage: node scripts/serve-web.mjs [--port 4173] [--dir dist-e2e]   (or PORT=4173)
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const dirFlag = process.argv.indexOf("--dir");
const DIST = resolve(
  fileURLToPath(
    new URL(`../${dirFlag === -1 ? "dist" : process.argv[dirFlag + 1]}`, import.meta.url),
  ),
);
const portFlag = process.argv.indexOf("--port");
const PORT = Number(portFlag === -1 ? (process.env.PORT ?? 4173) : process.argv[portFlag + 1]);

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
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function resolveFile(urlPath) {
  const candidate = normalize(join(DIST, decodeURIComponent(urlPath)));
  if (candidate !== DIST && !candidate.startsWith(DIST + sep)) return null;
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

const server = createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  let file;
  try {
    file = await resolveFile(pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  // SPA fallback only for page navigations, not for missing assets.
  if (file === null && extname(pathname) === "") file = join(DIST, "index.html");
  if (file === null) {
    res.writeHead(404, ISOLATION_HEADERS).end("Not found");
    return;
  }
  res.writeHead(200, {
    ...ISOLATION_HEADERS,
    "Content-Type": MIME_TYPES[extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Serving ${DIST} at http://localhost:${PORT}`);
});
