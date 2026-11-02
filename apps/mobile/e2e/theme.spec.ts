import { expect, test, type ConsoleMessage, type Page } from "./support/test";

const LIGHT_PAPER = "rgb(245, 247, 255)"; // palettes.light.paper #F5F7FF
const NIGHT_PAPER = "rgb(15, 26, 51)"; // palettes.dark.paper #0F1A33

type FirstPaint = { theme: string | null; background: string; themeColor: string | null };

/**
 * Records the page's theme at the moment the app first puts something in #root (before React's
 * effects run): it can only be what index.html's boot script applied before the first paint.
 */
async function recordThemeAtAppMount(page: Page) {
  await page.addInitScript(() => {
    const host = window as unknown as { __firstPaint?: FirstPaint };
    const capture = () => ({
      theme: document.documentElement.getAttribute("data-theme"),
      background: getComputedStyle(document.documentElement).backgroundColor,
      themeColor:
        document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null,
    });
    new MutationObserver((_, observer) => {
      const root = document.getElementById("root");
      if (root === null || root.childElementCount === 0) return;
      host.__firstPaint = capture();
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
}

const themeAttribute = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const pageBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("the chosen theme applies at once, survives a reload without a flash, and Sistema follows the system", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await page.emulateMedia({ colorScheme: "light" });
  await recordThemeAtAppMount(page);

  await page.goto("/");
  await expect(page.getByLabel("Racha: 0 días")).toBeVisible();
  expect(await themeAttribute(page)).toBe("light");

  await page.getByRole("button", { name: "Tema: Sistema. Cambiar tema", exact: true }).click();
  await page.getByRole("button", { name: "Tema: Claro. Cambiar tema", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tema: Oscuro. Cambiar tema", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Tema: Oscuro", { exact: true })).toBeAttached();
  await expect.poll(() => themeAttribute(page)).toBe("dark");
  await expect.poll(() => pageBackground(page)).toBe(NIGHT_PAPER);

  // Wait for the save to commit before reloading (test-only hook, EXPO_PUBLIC_E2E=1).
  await page.evaluate(() =>
    (
      window as unknown as { __e2e: { settingsWritesSettled: () => Promise<void> } }
    ).__e2e.settingsWritesSettled(),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  // Dark already when the document is parsed, before the app's bundle has rendered anything.
  expect(await themeAttribute(page)).toBe("dark");
  await expect(page.getByLabel("Racha: 0 días")).toBeVisible();
  const firstPaint = await page.evaluate(
    () => (window as unknown as { __firstPaint?: FirstPaint }).__firstPaint,
  );
  expect(firstPaint).toEqual({ theme: "dark", background: NIGHT_PAPER, themeColor: "#0F1A33" });
  await expect(
    page.getByRole("button", { name: "Tema: Oscuro. Cambiar tema", exact: true }),
  ).toBeVisible();
  expect(await pageBackground(page)).toBe(NIGHT_PAPER);

  // Sistema: back to the emulated light scheme, and following it live.
  await page.getByRole("button", { name: "Tema: Oscuro. Cambiar tema", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tema: Sistema. Cambiar tema", exact: true }),
  ).toBeVisible();
  await expect.poll(() => themeAttribute(page)).toBe("light");
  await expect.poll(() => pageBackground(page)).toBe(LIGHT_PAPER);

  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => themeAttribute(page)).toBe("dark");
  await expect.poll(() => pageBackground(page)).toBe(NIGHT_PAPER);
  expect(problems).toEqual([]);
});
