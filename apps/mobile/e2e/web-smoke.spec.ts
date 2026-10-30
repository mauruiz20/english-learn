import { expect, test, type ConsoleMessage } from "@playwright/test";

test("home loads progress from SQLite in the static web build", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");

  // Rendered from the repository: proves the database opened and migrations ran.
  await expect(page.getByText("Racha: 0 días")).toBeVisible();
  await expect(page.getByText("XP: 0")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hacer test de nivel" })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Racha: 0 días")).toBeVisible();

  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
  expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe("function");
  expect(problems).toEqual([]);
});

test("deep links fall back to the SPA and render the placeholder", async ({ page }) => {
  await page.goto("/lesson/a1-01");

  await expect(page.getByText("Lección a1-01")).toBeVisible();
  await expect(page.getByText("Próximamente")).toBeVisible();
});

test("about page shows the Tatoeba attribution", async ({ page }) => {
  await page.goto("/about");

  await expect(page.getByText(/CC BY 2\.0 FR/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "tatoeba.org" })).toBeVisible();
});
