import { playSessionCorrectly } from "./support/content";
import { expect, test, type ConsoleMessage } from "./support/test";

// `?rebuildProgress=1` is test-only (EXPO_PUBLIC_E2E=1): at start the app recomputes its progress
// cache from the event log, so whatever survives it was written as events.
test("progress from a lesson survives a reload that rebuilds it from the event log", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();
  await playSessionCorrectly(page, "¡Lección completada!");
  // 6 × 10 answer XP + 20 first-completion bonus.
  await expect(page.getByText("XP ganada: 80")).toBeVisible();
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await expect(page.getByText("80 XP", { exact: true })).toBeVisible();

  await page.goto("/?rebuildProgress=1");
  await expect(page.getByText("80 XP", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Racha: 1 día")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mi rutina diaria, completada" })).toBeVisible();

  // A replay earns answer XP only: the fold pays the bonus once per lesson.
  await page.getByRole("button", { name: "Mi rutina diaria, completada" }).click();
  await playSessionCorrectly(page, "¡Lección completada!");
  await expect(page.getByText("XP ganada: 60")).toBeVisible();
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await expect(page.getByText("140 XP", { exact: true })).toBeVisible();

  await page.goto("/?rebuildProgress=1");
  await expect(page.getByText("140 XP", { exact: true })).toBeVisible();
  expect(problems).toEqual([]);
});
