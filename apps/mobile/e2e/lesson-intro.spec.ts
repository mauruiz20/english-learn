import type { Page } from "@playwright/test";
import { expect, test, type ConsoleMessage } from "./support/test";
import { playSessionCorrectly } from "./support/content";

const LESSON = "Mi rutina diaria";
const POINT = "Para la rutina se usa el presente simple";

/** Waits for background settings writes to commit (test-only hook, EXPO_PUBLIC_E2E=1). */
async function settingsSettled(page: Page) {
  await page.evaluate(() =>
    (
      window as unknown as { __e2e: { settingsWritesSettled: () => Promise<void> } }
    ).__e2e.settingsWritesSettled(),
  );
}

function trackProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

test("an A2 lesson opens on its intro, then collapses it on a redo", async ({ page }) => {
  const problems = trackProblems(page);
  await page.goto("/");
  await page.getByRole("button", { name: LESSON, exact: true }).click();

  await expect(page.getByRole("heading", { name: "Antes de empezar" })).toBeVisible();
  await expect(page.getByText(POINT, { exact: false })).toBeVisible();
  await expect(page.getByLabel("Correcto: I have breakfast at seven.")).toBeVisible();
  await expect(page.getByText("Ejercicio 1 de 6")).toHaveCount(0);

  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await expect(page.getByText("Ejercicio 1 de 6")).toBeVisible();
  await expect(page.getByRole("button", { name: "Repasar la teoría" })).toHaveCount(0);
  await playSessionCorrectly(page, "¡Lección completada!");

  // The summary reopens the theory.
  await page.getByRole("button", { name: "Ver teoría", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Antes de empezar" })).toBeVisible();
  await page.getByRole("button", { name: "Volver al resumen", exact: true }).click();
  await expect(page.getByText("¡Lección completada!")).toBeVisible();

  await page.getByRole("button", { name: "Repetir lección", exact: true }).click();
  await expect(page.getByText("Ejercicio 1 de 6")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Antes de empezar" })).toHaveCount(0);
  const toggle = page.getByRole("button", { name: "Repasar la teoría" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(POINT, { exact: false })).toBeVisible();

  expect(problems).toEqual([]);
});

test("the first visit to a level shows its intro once", async ({ page }) => {
  const problems = trackProblems(page);
  await page.goto("/");

  const note = page.getByTestId("level-intro");
  await expect(note).toBeVisible();
  await expect(note.getByText("Nivel A2: el día a día")).toBeVisible();
  await expect(note.getByText("Al terminar este nivel podrás…")).toBeVisible();
  await settingsSettled(page);

  await page.reload();
  await expect(page.getByText("Lecciones de nivel A2")).toBeVisible();
  const reopen = page.getByRole("button", { name: "Qué aprenderás en el nivel A2" });
  await expect(reopen).toBeVisible();
  await expect(note).toHaveCount(0);

  // Reopened by hand from the path's header, and closed again.
  await reopen.click();
  await expect(note).toBeVisible();
  await note.getByRole("button", { name: "Entendido", exact: true }).click();
  await expect(note).toHaveCount(0);

  expect(problems).toEqual([]);
});
