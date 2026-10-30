#!/usr/bin/env node
// Dev tool (not part of the test suite): captures every screen of the e2e web export at phone
// (390×844) and desktop (1280×800) sizes, in light and dark color schemes, for design review.
//
// Usage: node scripts/screenshots.mjs <out-dir> [--skip-build] [--port 4174]
//
// Builds `dist-e2e/` (`pnpm export:web:e2e`, needed for the `?today=` clock override) unless
// --skip-build, serves it with scripts/serve-web.mjs and drives the app with Playwright Chromium
// in a fresh PERSISTENT profile per size and scheme (OPFS needs one; see e2e/support/test.ts).
// Answers come from packages/content/data, like the e2e helpers.
import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = resolve(APP_DIR, "../../packages/content/data");

const args = process.argv.slice(2);
const outArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--port");
if (outArg === undefined) {
  console.error("Usage: node scripts/screenshots.mjs <out-dir> [--skip-build] [--port 4174]");
  process.exit(1);
}
const OUT_DIR = resolve(outArg);
const portFlag = args.indexOf("--port");
const PORT = Number(portFlag === -1 ? 4174 : args[portFlag + 1]);
const BASE_URL = `http://localhost:${PORT}`;

const SIZES = [
  { name: "mobile", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  { name: "desktop", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
];
const SCHEMES = ["light", "dark"];
const DAY_1 = "2030-01-01";
const DAY_4 = "2030-01-04";

/** Every exercise and placement question by id, straight from the content data. */
function loadExercises() {
  const files = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return name.endsWith(".json") ? [path] : [];
    });
  const byId = new Map();
  for (const path of files(DATA_DIR)) {
    const file = JSON.parse(readFileSync(path, "utf8"));
    for (const e of file.exercises ?? []) byId.set(e.id, e);
    for (const q of file.placement ?? []) byId.set(q.id, q.exercise);
  }
  return byId;
}
const exercisesById = loadExercises();

async function currentExercise(page) {
  const node = page.locator('[data-testid^="exercise-"]').first();
  await node.waitFor();
  const id = (await node.getAttribute("data-testid")).slice("exercise-".length);
  const exercise = exercisesById.get(id);
  if (exercise === undefined) throw new Error(`Unknown exercise "${id}"`);
  return { id, exercise, scope: page.getByTestId(`exercise-${id}`) };
}

const radio = (scope, name) => scope.getByRole("radio", { name, exact: true }).first();
const button = (scope, name) => scope.getByRole("button", { name, exact: true }).first();
const bankToken = (scope, name) =>
  scope.getByLabel("Palabras disponibles").getByRole("button", { name, exact: true }).first();

/** Fills in the correct answer of the exercise on screen (does not submit). */
async function fillCorrectly(page) {
  const { exercise, scope } = await currentExercise(page);
  switch (exercise.type) {
    case "vocab":
    case "translation_choice":
      await radio(scope, exercise.options[exercise.answerIndex]).click();
      break;
    case "cloze":
      await radio(scope, exercise.answers[0]).click();
      break;
    case "word_order":
      for (const token of exercise.accepted[0].split(" ")) await bankToken(scope, token).click();
      break;
    case "translate_write":
      await scope.getByLabel("Tu traducción en inglés").fill(exercise.accepted[0]);
      break;
    case "reading":
      for (const q of exercise.questions) {
        await scope
          .getByRole("radiogroup", { name: q.prompt, exact: true })
          .getByRole("radio", { name: q.options[q.answerIndex], exact: true })
          .click();
      }
      break;
  }
  return scope;
}

/** Lets fonts, layout and short animations (feedback highlight) settle. */
async function settle(page, ms = 600) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}

/** Viewport screenshot; with `full`, also one with the viewport stretched to the content. */
async function shot(page, size, scheme, name, { full = false } = {}) {
  await settle(page);
  const base = join(OUT_DIR, `${size.name}-${scheme}-${name}`);
  await page.screenshot({ path: `${base}.png` });
  if (!full) return;
  // RN-web scrolls inside a ScrollView, not the document: grow the viewport to fit it instead.
  const height = await page.evaluate(() =>
    Math.max(
      document.documentElement.scrollHeight,
      ...[...document.querySelectorAll("div")].map(
        (el) => el.scrollHeight - el.clientHeight + window.innerHeight,
      ),
    ),
  );
  if (height > size.viewport.height + 4) {
    await page.setViewportSize({ width: size.viewport.width, height: Math.min(height, 6000) });
    await settle(page, 300);
    await page.screenshot({ path: `${base}-full.png` });
    await page.setViewportSize(size.viewport);
    await settle(page, 200);
  }
}

async function goHome(page, today) {
  await page.goto(`/?today=${today}`);
  await page.getByRole("button", { name: "Acerca de", exact: true }).waitFor();
}

async function capture(browserType, size, scheme) {
  const profile = mkdtempSync(join(tmpdir(), "english-learn-shots-"));
  const context = await browserType.launchPersistentContext(profile, {
    baseURL: BASE_URL,
    viewport: size.viewport,
    deviceScaleFactor: size.deviceScaleFactor,
    colorScheme: scheme,
    reducedMotion: "no-preference",
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const snap = (name, options) => shot(page, size, scheme, name, options);
  try {
    // Home, fresh profile.
    await goHome(page, DAY_1);
    await snap("01-home-fresh", { full: true });

    // A second tab cannot open the database: the error boundary screen.
    const second = await context.newPage();
    await second.goto(`/?today=${DAY_1}`);
    await second.getByRole("button", { name: "Reintentar", exact: true }).waitFor();
    await shot(second, size, scheme, "02-db-error-open-elsewhere");
    await second.close();

    // Placement intro and one question.
    await page.getByRole("button", { name: "Hacer test de nivel" }).click();
    await page.getByRole("button", { name: "Empezar", exact: true }).waitFor();
    await snap("03-placement-intro");
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    await fillCorrectly(page);
    await snap("04-placement-question");

    // Lesson: one screen per exercise type, with each feedback state.
    await goHome(page, DAY_1);
    await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();
    const check = () => button(page, "Comprobar").click();
    const next = async () => {
      await button(page, "Continuar").click();
      await page.waitForTimeout(150);
    };
    let n = 5;
    const step = () => String(n++).padStart(2, "0");

    // vocab: selected option, then correct feedback.
    await fillCorrectly(page);
    await snap(`${step()}-lesson-vocab`);
    await check();
    await page.getByRole("alert").first().waitFor();
    await snap(`${step()}-feedback-correct`);
    // Leaving mid-lesson asks first.
    await page.goBack();
    await page.getByRole("button", { name: "Seguir aquí", exact: true }).waitFor();
    await snap(`${step()}-confirm-leave`);
    await button(page, "Seguir aquí").click();
    await next();

    // cloze: answered wrong.
    {
      const { exercise, scope } = await currentExercise(page);
      await snap(`${step()}-lesson-cloze`);
      await radio(scope, exercise.distractors[0]).click();
      await check();
      await page.getByRole("alert").first().waitFor();
      await snap(`${step()}-feedback-wrong`);
      await next();
    }

    // word order: two tokens placed.
    {
      const { exercise, scope } = await currentExercise(page);
      for (const token of exercise.accepted[0].split(" ").slice(0, 2)) {
        await bankToken(scope, token).click();
      }
      await snap(`${step()}-lesson-word-order`);
      for (const token of exercise.accepted[0].split(" ").slice(2)) {
        await bankToken(scope, token).click();
      }
      await check();
      await next();
    }

    // translation choice.
    await fillCorrectly(page);
    await snap(`${step()}-lesson-translation-choice`);
    await check();
    await next();

    // reading.
    await currentExercise(page);
    await snap(`${step()}-lesson-reading`, { full: true });
    await fillCorrectly(page);
    await check();
    await next();

    // translate-write with a typo: "almost".
    {
      const { exercise, scope } = await currentExercise(page);
      const typo = exercise.accepted[0].replace("usually", "usualy").replace(/[.]$/, "");
      await scope.getByLabel("Tu traducción en inglés").fill(typo);
      await snap(`${step()}-lesson-translate-write`);
      await check();
      await page.getByRole("alert").first().waitFor();
      await snap(`${step()}-feedback-almost`);
      await next();
    }

    // Summary.
    await page.getByRole("button", { name: "Volver al inicio", exact: true }).waitFor();
    await snap(`${step()}-lesson-summary`);

    // Home with progress, days later: reviews are pending.
    await goHome(page, DAY_4);
    await snap(`${step()}-home-progress`, { full: true });

    // Review.
    await page.getByRole("button", { name: "Repasar", exact: true }).click();
    await currentExercise(page);
    await snap(`${step()}-review`);

    // About.
    await page.goto(`/about?today=${DAY_4}`);
    await page.getByRole("link", { name: "tatoeba.org" }).waitFor();
    await snap(`${step()}-about`);
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not start at ${url}`);
}

async function main() {
  if (!args.includes("--skip-build")) {
    const build = spawnSync("pnpm", ["export:web:e2e"], { cwd: APP_DIR, stdio: "inherit" });
    if (build.status !== 0) process.exit(build.status ?? 1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const server = spawn(
    process.execPath,
    ["scripts/serve-web.mjs", "--port", String(PORT), "--dir", "dist-e2e"],
    { cwd: APP_DIR, stdio: "ignore" },
  );
  try {
    await waitForServer(BASE_URL);
    const browser = chromium;
    for (const size of SIZES) {
      for (const scheme of SCHEMES) {
        console.log(`Capturing ${size.name} / ${scheme}`);
        await capture(browser, size, scheme);
      }
    }
    console.log(`Screenshots in ${OUT_DIR}`);
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
