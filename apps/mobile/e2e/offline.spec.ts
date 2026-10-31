import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { expect, test, waitForServiceWorker } from "./support/test";

// The installable web app (PWA): after one online visit, the service worker serves the whole
// app from its cache, still cross-origin isolated (expo-sqlite needs SharedArrayBuffer).

const LESSON = "/lesson/a2.daily-routine.lesson-001";

test.describe("offline web app", () => {
  // Runs on Chromium and WebKit: both take the worker offline with `setOffline` (the
  // not-precached probe at the end proves it).

  test("opens the home and a dotted deep link offline, with data, fonts and sounds", async ({
    page,
    context,
  }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });

    await page.goto("/");
    await expect(page.getByLabel("Racha: 0 días")).toBeVisible();
    // Data stored in SQLite while online.
    await page.getByRole("button", { name: "Silenciar sonidos", exact: true }).click();
    await expect(page.getByRole("button", { name: "Activar sonidos", exact: true })).toBeVisible();
    await waitForServiceWorker(page);

    const failed: string[] = [];
    const networkFirstAttempts: string[] = [];
    const fromNetwork: string[] = [];
    const assets: string[] = [];
    context.on("requestfailed", (request) => {
      const path = new URL(request.url()).pathname;
      // The worker's own attempts to fetch navigations first (Chromium reports them).
      if (request.serviceWorker()) networkFirstAttempts.push(path);
      else failed.push(path);
    });
    context.on("response", (response) => {
      const url = response.url();
      if (!/\.(js|ttf|wav|wasm|png)$/.test(new URL(url).pathname)) return;
      assets.push(url);
      if (!response.fromServiceWorker()) fromNetwork.push(url);
    });
    await context.setOffline(true);

    // The app shell comes from the worker's cache, with the isolation headers.
    const shell = await page.reload();
    expect(shell?.fromServiceWorker()).toBe(true);
    expect(shell?.headers()).toMatchObject({
      "cross-origin-embedder-policy": "require-corp",
      "cross-origin-opener-policy": "same-origin",
    });
    await expect(page.getByLabel("Racha: 0 días")).toBeVisible();
    await expect(page.getByRole("button", { name: "Activar sonidos", exact: true })).toBeVisible();
    expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
    expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe("function");

    // A deep link whose id contains dots is a navigation, not a file: it gets the app shell.
    await page.goto(LESSON);
    await expect(page.getByText("Ejercicio 1 de 6")).toBeVisible();
    expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
    // Sounds on again, then answer: the tap and feedback sounds come from the cache.
    await page.getByRole("button", { name: "Activar sonidos", exact: true }).click();
    await page.getByRole("radio", { name: "despertarse", exact: true }).click();
    await page.getByRole("button", { name: "Comprobar", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Correcto");
    // They really played, offline: the e2e build logs each sound Web Audio started.
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __e2e?: { playedSounds?: string[] } }).__e2e?.playedSounds,
        ),
      )
      .toEqual(["tap", "correct"]);

    // Fonts load on demand: the ones this screen uses came from the cache, none failed.
    const fonts = await page.evaluate(() => {
      const faces: string[] = [];
      document.fonts.forEach((font) => faces.push(`${font.family} ${font.status}`));
      return faces;
    });
    expect(fonts).toEqual(
      expect.arrayContaining([
        "BricolageGrotesque_600SemiBold loaded",
        "AtkinsonHyperlegible_400Regular loaded",
        "AtkinsonHyperlegible_700Bold loaded",
      ]),
    );
    expect(fonts.filter((font) => font.endsWith(" error"))).toEqual([]);
    expect(assets.some((url) => url.endsWith(".ttf"))).toBe(true);
    expect(assets.some((url) => url.endsWith(".wav"))).toBe(true);
    expect(fromNetwork).toEqual([]);
    expect(failed).toEqual([]);
    // Every request the worker sent to the (offline) network was a navigation.
    expect(networkFirstAttempts.filter((path) => path !== "/" && path !== LESSON)).toEqual([]);
    expect(problems).toEqual([]);

    // Really offline (last: the browser logs the failure): what was not precached cannot load.
    expect(
      await page.evaluate(() =>
        fetch("/not-precached.json").then(
          () => "online",
          () => "offline",
        ),
      ),
    ).toBe("offline");
  });

  test("offers a new version and reloads only when the learner presses Actualizar", async ({
    page,
  }) => {
    // Its own server, on its own origin: a new deploy there holds for every request (WebKit's
    // soft update after each navigation sends no cookies) and never reaches the other tests.
    const { createStaticServer } = await import("../scripts/serve-web.mjs");
    let version: string | null = null;
    const server = createStaticServer({
      dir: join(__dirname, "..", "dist-e2e"),
      serviceWorkerVersion: () => version,
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const origin = `http://localhost:${(server.address() as AddressInfo).port}`;
    try {
      await page.goto(`${origin}/`);
      await expect(page.getByLabel("Racha: 0 días")).toBeVisible();
      await waitForServiceWorker(page);
      await expect(page.getByText("Hay una versión nueva")).toBeHidden();

      // A new deploy: sw.js changes (the server appends a comment).
      version = "2";
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
      });

      await expect(page.getByText("Hay una versión nueva")).toBeVisible();
      // It waits for the learner: no reload, the page keeps its state.
      await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);

      const reloaded = page.waitForEvent("load");
      await page.getByRole("button", { name: "Actualizar", exact: true }).click();
      await reloaded;

      await expect(page.getByLabel("Racha: 0 días")).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(
        undefined,
      );
      await expect(page.getByText("Hay una versión nueva")).toBeHidden();
      const scriptUrl = await page.evaluate(
        () => navigator.serviceWorker.controller?.scriptURL ?? null,
      );
      expect(scriptUrl).toBe(`${origin}/sw.js`);
      // The browser checks sw.js again after each navigation (WebKit about 1 s later): the same
      // deploy is not offered twice.
      await page.waitForTimeout(2000);
      await expect(page.getByText("Hay una versión nueva")).toBeHidden();
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
