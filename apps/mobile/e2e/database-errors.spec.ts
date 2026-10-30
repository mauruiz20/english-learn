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
  await second.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(second.getByText("0 XP", { exact: true })).toBeVisible();
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
