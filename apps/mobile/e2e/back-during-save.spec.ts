import { answerCorrectly } from "./support/content";
import { expect, test } from "./support/test";

test("browser back right as the lesson saves keeps the save once and home shows it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();

  // Answer every exercise; stop on the last feedback, before the save starts.
  for (let n = 1; n <= 6; n++) {
    await expect(page.getByText(`Ejercicio ${n} de 6`)).toBeVisible();
    await answerCorrectly(page, "Comprobar");
    await expect(page.getByRole("alert")).toHaveText("Correcto");
    if (n < 6) await page.getByRole("button", { name: "Continuar", exact: true }).click();
  }

  // The last "Continuar" starts the save; go back without waiting for it.
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.goBack();

  // 6 × 10 answer XP + 20 completion bonus, saved exactly once.
  await expect(page.getByText("Lecciones de nivel A2")).toBeVisible();
  await expect(page.getByText("80 XP", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mi rutina diaria, completada" })).toBeVisible();

  await page.reload();
  await expect(page.getByText("80 XP", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Racha: 1 día")).toBeVisible();
});
