import type { Page } from "@playwright/test";
import { expect, test, type ConsoleMessage } from "./support/test";
import { answerPlacementAs, playSessionCorrectly } from "./support/content";

// `?today=` is a test-only clock override, compiled in only with EXPO_PUBLIC_E2E=1.
const DAY_1 = "2030-01-01";
const FIRST_B1_LESSON = "La vida en la ciudad";

/** Takes the placement test as a B2 learner (right up to B2, wrong above). */
async function placeAtB2(page: Page) {
  await page.getByRole("button", { name: "Hacer test de nivel" }).click();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  const result = page.getByText(/^Tu nivel estimado/);
  let asked = 0;
  await expect(page.getByText("Pregunta 1 de hasta 20")).toBeVisible();
  while (!(await result.isVisible())) {
    asked += 1;
    await answerPlacementAs(page, "b2");
    await expect(result.or(page.getByText(`Pregunta ${asked + 1} de hasta 20`))).toBeVisible();
  }
  await page.getByRole("button", { name: "Ir a mis lecciones", exact: true }).click();
}

function levelPicker(page: Page) {
  return page.getByRole("button", { name: /^Nivel del recorrido: / });
}

/** Opens the path's level picker and picks `option` (a radio name, e.g. /^B1, /). */
async function pickLevel(page: Page, option: RegExp) {
  await levelPicker(page).click();
  await page.getByRole("radio", { name: option }).click();
}

/** Waits for the stored choice to commit before reloading (test-only hook, EXPO_PUBLIC_E2E=1). */
async function reloadAfterSettings(page: Page) {
  await page.evaluate(() =>
    (
      window as unknown as { __e2e: { settingsWritesSettled: () => Promise<void> } }
    ).__e2e.settingsWritesSettled(),
  );
  await page.reload();
}

test("path level: a high placement keeps a started B1, and a level picked by hand survives a reload", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto(`/?today=${DAY_1}`);
  await placeAtB2(page);
  await expect(page.getByRole("heading", { name: "Lecciones de nivel B2" })).toBeVisible();
  await expect(levelPicker(page)).toHaveAccessibleName("Nivel del recorrido: B2, automático");

  // Start B1 by hand: its first lesson.
  await pickLevel(page, /^B1, 0 % completado$/);
  await expect(page.getByRole("heading", { name: "Lecciones de nivel B1" })).toBeVisible();
  await expect(levelPicker(page)).toHaveAccessibleName("Nivel del recorrido: B1, elegido a mano");
  await page.getByRole("button", { name: FIRST_B1_LESSON, exact: true }).click();
  await playSessionCorrectly(page, "¡Lección completada!");

  // Back to automatic: B1 is started and not finished, so the B2 placement does not skip it.
  await page.goto(`/?today=${DAY_1}`);
  await pickLevel(page, /^Automático, ahora B1$/);
  await expect(levelPicker(page)).toHaveAccessibleName("Nivel del recorrido: B1, automático");
  await expect(page.getByRole("heading", { name: "Lecciones de nivel B1" })).toBeVisible();
  await reloadAfterSettings(page);
  await expect(page.getByRole("heading", { name: "Lecciones de nivel B1" })).toBeVisible();
  await expect(levelPicker(page)).toHaveAccessibleName("Nivel del recorrido: B1, automático");
  await expect(
    page.getByRole("button", { name: new RegExp(`^${FIRST_B1_LESSON}, completada`) }),
  ).toBeVisible();

  // Switch to B2 by hand: it survives a reload.
  await pickLevel(page, /^B2, 0 % completado$/);
  await expect(page.getByRole("heading", { name: "Lecciones de nivel B2" })).toBeVisible();
  await reloadAfterSettings(page);
  await expect(page.getByRole("heading", { name: "Lecciones de nivel B2" })).toBeVisible();
  await expect(levelPicker(page)).toHaveAccessibleName("Nivel del recorrido: B2, elegido a mano");

  // And back to B1 by hand, which survives a reload too.
  await pickLevel(page, /^B1, \d+ % completado$/);
  await expect(page.getByRole("heading", { name: "Lecciones de nivel B1" })).toBeVisible();
  await reloadAfterSettings(page);
  await expect(page.getByRole("heading", { name: "Lecciones de nivel B1" })).toBeVisible();
  await expect(levelPicker(page)).toHaveAccessibleName("Nivel del recorrido: B1, elegido a mano");
  expect(problems).toEqual([]);
});
