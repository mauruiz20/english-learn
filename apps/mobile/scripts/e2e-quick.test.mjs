import assert from "node:assert/strict";
import { test } from "node:test";
import { quickRuns } from "./e2e-quick.mjs";

test("runs every spec on Chromium and the named specs on WebKit", () => {
  assert.deepEqual(quickRuns(["e2e/review.spec.ts", "e2e/review-backlog.spec.ts"]), [
    ["--project=chromium"],
    ["--project=webkit", "e2e/review.spec.ts", "e2e/review-backlog.spec.ts"],
  ]);
});

test("falls back to the WebKit smoke spec when no spec is named", () => {
  assert.deepEqual(quickRuns([]), [
    ["--project=chromium"],
    ["--project=webkit", "e2e/web-smoke.spec.ts"],
  ]);
});
