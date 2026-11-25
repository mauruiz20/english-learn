// Quick e2e check for small changes, used when no CI runs the full suite.
//
//   pnpm e2e:quick [spec ...]
//
// Exports the e2e web build, then runs every spec on Chromium (parallel, fast) and only the named
// specs on WebKit (which runs on one worker and is the slow half of the full suite). With no spec
// named, WebKit runs the smoke spec. Large changes and releases still run the full suite:
// `pnpm e2e:web`.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const WEBKIT_FALLBACK = "e2e/web-smoke.spec.ts";

/** The Playwright argument lists to run, in order. */
export function quickRuns(specs) {
  return [
    ["--project=chromium"],
    ["--project=webkit", ...(specs.length > 0 ? specs : [WEBKIT_FALLBACK])],
  ];
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const specs = process.argv.slice(2);
  let status = run("pnpm", ["export:web:e2e"]);
  for (const args of quickRuns(specs)) {
    if (status !== 0) break;
    status = run("npx", ["playwright", "test", ...args]);
  }
  process.exit(status);
}
