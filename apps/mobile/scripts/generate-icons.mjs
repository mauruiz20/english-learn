#!/usr/bin/env node
// Rasterizes the app icon (assets/icon/icon.svg) into every image the app config uses, with
// Playwright's Chromium (already a dev dependency; no image library needed):
//   node scripts/generate-icons.mjs [--preview <out.png>]
// then `pnpm generate:pwa-icons` derives the web icons from assets/images/icon.png.
//
// Variants come from the SVG's layers (#paper with its #rules, and #mark: #swipe + #glyph):
// - icon.png (1024): everything, full-bleed (also the maskable PWA icon).
// - android-icon-background.png (512): the paper and its rules.
// - android-icon-foreground.png (512): the mark on transparent, shrunk into the adaptive icon's
//   safe zone (the launcher crops the outer third into circles, squircles…).
// - android-icon-monochrome.png (432): the glyph alone (themed icons use only its alpha).
// - splash-icon.png (512): the mark on transparent, on the light paper splash.
// - splash-icon-dark.png (512): the whole page with rounded corners, on the deep-ink splash.
// - favicon.png (48): everything.
// --preview also writes a sheet with every variant and the icon at common launcher sizes.
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(APP_DIR, "assets/icon/icon.svg");
const IMAGES = resolve(APP_DIR, "assets/images");

/** Scale of the mark in the adaptive foreground and the monochrome icon (safe zone: 66/108). */
const ADAPTIVE_SCALE = 0.82;

/**
 * Each variant: output file, size, and how to adjust the SVG document before the screenshot
 * (`svg` is the root element; runs in the page).
 */
export const VARIANTS = [
  { file: "icon.png", size: 1024, adjust: "" },
  { file: "favicon.png", size: 48, adjust: "" },
  {
    file: "android-icon-background.png",
    size: 512,
    adjust: `svg.querySelector("#mark").remove();`,
  },
  {
    file: "android-icon-foreground.png",
    size: 512,
    adjust: `svg.querySelector("#paper").remove();
      svg.querySelector("#mark").setAttribute("transform", "translate(512 512) scale(${ADAPTIVE_SCALE}) translate(-512 -545)");`,
  },
  {
    file: "android-icon-monochrome.png",
    size: 432,
    adjust: `svg.querySelector("#paper").remove();
      svg.querySelector("#swipe").remove();
      svg.querySelector("#glyph").setAttribute("stroke", "#000000");
      svg.querySelector("#mark").setAttribute("transform", "translate(512 512) scale(${ADAPTIVE_SCALE}) translate(-512 -545)");`,
  },
  {
    file: "splash-icon.png",
    size: 512,
    adjust: `svg.querySelector("#paper").remove();
      svg.setAttribute("viewBox", "160 200 704 704");`,
  },
  {
    file: "splash-icon-dark.png",
    size: 512,
    adjust: `const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
      clip.id = "page";
      clip.innerHTML = '<rect x="64" y="64" width="896" height="896" rx="200"/>';
      svg.prepend(clip);
      for (const id of ["paper", "mark"]) svg.querySelector("#" + id).setAttribute("clip-path", "url(#page)");`,
  },
];

async function render(page, svg, size, adjust) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`,
  );
  await page.evaluate(
    ({ size, adjust }) => {
      const svg = document.querySelector("svg");
      svg.setAttribute("width", String(size));
      svg.setAttribute("height", String(size));
      svg.style.display = "block";
      new Function("svg", adjust)(svg);
    },
    { size, adjust },
  );
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

async function main() {
  const args = process.argv.slice(2);
  const previewFlag = args.indexOf("--preview");
  const preview = previewFlag === -1 ? null : resolve(args[previewFlag + 1]);
  const svg = await readFile(SOURCE, "utf8");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const outputs = [];
    for (const { file, size, adjust } of VARIANTS) {
      const png = await render(page, svg, size, adjust);
      const path = resolve(IMAGES, file);
      await writeFile(path, png);
      outputs.push({ file, size, png });
      console.log(`assets/images/${file} (${size}×${size})`);
    }
    if (preview !== null) await writePreview(page, outputs, preview);
  } finally {
    await browser.close();
  }
}

/** A review sheet: each variant on light and dark, and the icon at launcher sizes. */
async function writePreview(page, outputs, path) {
  const uri = (png) => `data:image/png;base64,${png.toString("base64")}`;
  const icon = outputs.find((o) => o.file === "icon.png");
  const tile = (o) => `<figure><div class="pair">
      <div class="light"><img src="${uri(o.png)}" style="width:${Math.min(o.size, 160)}px"></div>
      <div class="dark"><img src="${uri(o.png)}" style="width:${Math.min(o.size, 160)}px"></div>
    </div><figcaption>${o.file} · ${o.size}px</figcaption></figure>`;
  const launcher = [192, 96, 72, 48, 36, 24, 16]
    .map(
      (s) => `<figure><div class="row">
        <img src="${uri(icon.png)}" style="width:${s}px;border-radius:22%">
        <img src="${uri(icon.png)}" style="width:${s}px;border-radius:50%">
      </div><figcaption>${s}px</figcaption></figure>`,
    )
    .join("");
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 24px; font: 14px system-ui; background: #fff; color: #1B2333; }
    h2 { margin: 16px 0 8px; } section { display: flex; flex-wrap: wrap; gap: 16px; align-items: end; }
    figure { margin: 0; } figcaption { margin-top: 4px; color: #4A5873; }
    .pair, .row { display: flex; gap: 8px; align-items: center; }
    .light, .dark { padding: 12px; } .light { background: #F5F7FF; } .dark { background: #0F1A33; }
    img { display: block; }
  </style></head><body>
    <h2>Variants (on paper and on deep ink)</h2><section>${outputs.map(tile).join("")}</section>
    <h2>Launcher sizes (squircle and circle masks)</h2><section>${launcher}</section>
  </body></html>`);
  await page.screenshot({ path, fullPage: true });
  console.log(`preview: ${path}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
