import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { VARIANTS } from "./generate-icons.mjs";

const app = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8")).expo;

/** Every image path in the app config, wherever it is. */
function imagePaths(value) {
  if (typeof value === "string") return value.endsWith(".png") ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(imagePaths);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(imagePaths);
  return [];
}

test("every image the app config uses is generated from the icon source", () => {
  const generated = new Set(VARIANTS.map((v) => `./assets/images/${v.file}`));
  const used = imagePaths(app);
  assert.ok(used.length >= 7);
  for (const path of used) assert.ok(generated.has(path), `${path} is not generated`);
});

test("the main icon is 1024 px and the favicon 48 px", () => {
  const size = (file) => VARIANTS.find((v) => v.file === file)?.size;
  assert.equal(size("icon.png"), 1024);
  assert.equal(size("favicon.png"), 48);
});
