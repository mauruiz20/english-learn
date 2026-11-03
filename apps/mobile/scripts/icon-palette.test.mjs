// The app icon, its generated images and the web shell follow the theme tokens
// (src/shared/ui/theme.ts), so a palette change cannot leave the icon in old colors.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decodePng } from "./png.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** The light or dark token values of theme.ts, read as text (no TypeScript runtime here). */
function tokens(scheme) {
  const source = read("src/shared/ui/theme.ts");
  const palettes = source.slice(source.indexOf("export const palettes"));
  const block = palettes.slice(palettes.indexOf(`${scheme}: {`));
  const token = (name) => {
    const match = new RegExp(`\\b${name}: "(#[0-9A-Fa-f]{6})"`).exec(block);
    assert.ok(match, `${scheme}.${name} not found in theme.ts`);
    return match[1].toUpperCase();
  };
  const highlighter = /const HIGHLIGHTER = "(#[0-9A-Fa-f]{6})"/.exec(source)[1].toUpperCase();
  return { paper: token("paper"), rule: token("rule"), ink: token("ink"), highlighter };
}

const light = tokens("light");
const dark = tokens("dark");

/** Every hex color the icon source uses, uppercased. */
const svgColors = () =>
  [...read("assets/icon/icon.svg").matchAll(/"(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase());

function pixel(path, x, y) {
  const png = decodePng(readFileSync(new URL(`../${path}`, import.meta.url)));
  const i = (y * png.width + x) * 4;
  const hex = (n) => n.toString(16).padStart(2, "0");
  return `#${hex(png.data[i])}${hex(png.data[i + 1])}${hex(png.data[i + 2])}`.toUpperCase();
}

test("the icon source uses only the light theme's paper, rule, ink and highlighter", () => {
  const required = [light.paper, light.rule, light.ink, light.highlighter];
  for (const color of svgColors()) assert.ok(required.includes(color), `${color} is not a token`);
  for (const color of required) assert.ok(svgColors().includes(color), `${color} is missing`);
});

test("the generated icons are painted on the current paper", () => {
  for (const path of [
    "assets/images/icon.png",
    "assets/images/favicon.png",
    "assets/images/android-icon-background.png",
    "public/icons/icon-192.png",
    "public/icons/icon-512.png",
    "public/apple-touch-icon.png",
  ])
    assert.equal(pixel(path, 1, 1), light.paper, `${path} corner`);
});

test("the manifest and the HTML shell use the current paper colors", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  assert.equal(manifest.theme_color.toUpperCase(), light.paper);
  assert.equal(manifest.background_color.toUpperCase(), light.paper);
  const html = read("public/index.html").toUpperCase();
  const backgrounds = [...html.matchAll(/BACKGROUND-COLOR: (#[0-9A-F]{6})/g)].map((m) => m[1]);
  assert.ok(backgrounds.length > 0);
  for (const color of backgrounds) assert.ok([light.paper, dark.paper].includes(color), color);
});

test("the app config's adaptive icon and splash use the theme's paper", () => {
  const app = JSON.parse(read("app.json")).expo;
  assert.equal(app.android.adaptiveIcon.backgroundColor.toUpperCase(), light.paper);
  const splash = app.plugins.find((p) => Array.isArray(p) && p[0] === "expo-splash-screen")[1];
  assert.equal(splash.backgroundColor.toUpperCase(), light.paper);
  assert.equal(splash.dark.backgroundColor.toUpperCase(), dark.paper);
});
