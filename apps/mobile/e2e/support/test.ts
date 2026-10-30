// Playwright `test` whose pages live in a PERSISTENT browser context (fresh profile per test).
//
// expo-sqlite on web stores the database in the Origin Private File System (OPFS). Playwright's
// default contexts are ephemeral, and WebKit disables OPFS there (like Safari Private Browsing):
// `navigator.storage.getDirectory()` rejects with `UnknownError`. A persistent context behaves
// like a regular browser profile, so both Chromium and WebKit run the app as real users see it.
// The ephemeral case is covered on purpose by `storage-unavailable.spec.ts`.
//
// Playwright's WebKit keeps website data (OPFS included) in ONE place shared by every persistent
// profile, so the webkit project runs with one worker and each test starts by emptying OPFS.
import { test as base, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const test = base.extend({
  context: async (
    {
      playwright,
      browserName,
      headless,
      launchOptions,
      baseURL,
      viewport,
      userAgent,
      deviceScaleFactor,
      isMobile,
      hasTouch,
      locale,
    },
    provide,
  ) => {
    const userDataDir = await mkdtemp(join(tmpdir(), `english-learn-e2e-${browserName}-`));
    const context = await playwright[browserName].launchPersistentContext(userDataDir, {
      ...launchOptions,
      headless,
      ...(baseURL === undefined ? {} : { baseURL }),
      viewport,
      ...(userAgent === undefined ? {} : { userAgent }),
      ...(deviceScaleFactor === undefined ? {} : { deviceScaleFactor }),
      isMobile,
      hasTouch,
      ...(locale === undefined ? {} : { locale }),
    });
    await provide(context);
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  },
  // A persistent context opens with one blank page: reuse it instead of opening a second one.
  page: async ({ context }, provide) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await clearOriginPrivateFileSystem(page);
    await provide(page);
  },
});

/**
 * Empties OPFS for the app's origin from a same-origin page that is not the app (a static JSON
 * file the export always contains), so no database is open while its files are removed.
 */
async function clearOriginPrivateFileSystem(page: Page) {
  await page.goto("/metadata.json");
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    // `keys()` is missing from the DOM lib typings used here.
    for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
      names.push(name);
    }
    await Promise.all(names.map((name) => root.removeEntry(name, { recursive: true })));
  });
}

export { expect } from "@playwright/test";
export type { ConsoleMessage, Page } from "@playwright/test";
