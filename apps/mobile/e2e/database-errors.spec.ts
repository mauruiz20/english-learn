import { test as ephemeral } from "@playwright/test";
import { expect, test } from "./support/test";

test("a second tab explains the app is already open, and works once the first one closes", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();

  // Same browser profile: the first tab holds the database (OPFS access handles).
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.getByRole("heading")).toHaveText("La app ya está abierta en otra pestaña.");
  await expect(second.getByText("Ciérrala y pulsa Reintentar.")).toBeVisible();

  await page.close();
  // With the service worker running, WebKit can release the closed tab's database a moment
  // later (the first "Reintentar" may still find it open): retry like a learner would.
  const retry = second.getByRole("button", { name: "Reintentar", exact: true });
  await expect(async () => {
    if (await retry.isVisible()) await retry.click();
    await expect(second.getByText("0 XP", { exact: true })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
});

// Playwright's default ephemeral contexts are what Safari Private Browsing looks like to WebKit:
// no OPFS. The app must explain it instead of showing a blank page.
ephemeral(
  "WebKit without persistent storage shows a message instead of a blank page",
  async ({ page, browserName }) => {
    ephemeral.skip(browserName !== "webkit", "Only WebKit disables OPFS in ephemeral contexts");

    await page.goto("/");

    await expect(page.getByRole("heading")).toHaveText("No pudimos abrir tus datos.");
    await expect(page.getByRole("button", { name: "Reintentar", exact: true })).toBeVisible();
  },
);
