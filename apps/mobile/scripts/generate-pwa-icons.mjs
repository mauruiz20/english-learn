#!/usr/bin/env node
// Derives the web app icons from the app icon (assets/images/icon.png, 1024×1024) into public/,
// which `expo export -p web` copies to the site root. Run after changing the app icon:
//   pnpm generate:pwa-icons
// The icon is full-bleed with its glyph inside the central 80 % circle, so the 512 px icon also
// serves as the maskable one. Translucent pixels are flattened onto the light paper color: home
// screen icons must be opaque (iOS fills transparency with black).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { decodePng, encodePng, flatten, resize } from "./png.mjs";

const SOURCE = new URL("../assets/images/icon.png", import.meta.url);
const PAPER = [0xf5, 0xf7, 0xff];

export const ICONS = [
  { path: "icons/icon-192.png", size: 192 },
  { path: "icons/icon-512.png", size: 512 },
  // iOS "Add to Home Screen" (linked from public/index.html).
  { path: "apple-touch-icon.png", size: 180 },
];

const icon = flatten(decodePng(await readFile(SOURCE)), PAPER);
await mkdir(new URL("../public/icons/", import.meta.url), { recursive: true });
for (const { path, size } of ICONS) {
  await writeFile(
    new URL(`../public/${path}`, import.meta.url),
    encodePng(resize(icon, size, size)),
  );
  console.log(`public/${path} (${size}×${size})`);
}
