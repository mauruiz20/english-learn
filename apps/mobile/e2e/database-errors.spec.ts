import { test as ephemeral } from "@playwright/test";
import { expect, test } from "./support/test";

const OPEN_ELSEWHERE = "La app está abierta en otra pestaña o ventana";
const RELEASED = "La app se abrió en otra pestaña";

test("a second tab takes the app over with 'Usar aquí', and the first one can take it back", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();

  // Same browser profile: the first tab owns the database (OPFS access handles).
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.getByRole("heading")).toHaveText(OPEN_ELSEWHERE);
  await second.getByRole("button", { name: "Usar aquí", exact: true }).click();
  await expect(second.getByText("0 XP", { exact: true })).toBeVisible({ timeout: 15_000 });

  // The first tab finished its writes, let go of the database and says so.
  await expect(page.getByRole("heading")).toHaveText(RELEASED);
  await page.bringToFront();
  await page.getByRole("button", { name: "Usar aquí", exact: true }).click();
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(second.getByRole("heading")).toHaveText(RELEASED);
});

test("reloading never shows the 'open in another tab' screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();

  // The reloaded page starts while the previous page's SQLite worker still holds the files.
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await expect(page.getByText("0 XP", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(OPEN_ELSEWHERE)).toHaveCount(0);
  }
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
