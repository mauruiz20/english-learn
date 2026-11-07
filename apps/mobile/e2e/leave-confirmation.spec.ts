import { answerCorrectly, skipLessonIntro } from "./support/content";
import { expect, test, type Page } from "./support/test";

async function startLessonAndAnswerOne(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();
  await skipLessonIntro(page);
  await expect(page.getByText("Ejercicio 1 de 6")).toBeVisible();
  await answerCorrectly(page, "Comprobar");
  await expect(page.getByRole("alert")).toHaveText("Correcto");
}

const headerBack = (page: Page) =>
  page.getByRole("button", { name: "Volver a Inicio", exact: true });

const dialogTitle = (page: Page) => page.getByRole("heading", { name: "¿Salir de la lección?" });

test("leaving a lesson by the header back button asks first", async ({ page }) => {
  await startLessonAndAnswerOne(page);

  await headerBack(page).click();
  await expect(dialogTitle(page)).toBeVisible();
  await page.getByRole("button", { name: "Seguir aquí", exact: true }).click();
  await expect(dialogTitle(page)).toBeHidden();
  await expect(page.getByText("Ejercicio 1 de 6")).toBeVisible();

  await headerBack(page).click();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.getByText("Lecciones de nivel A2")).toBeVisible();
  // Nothing was saved.
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
});

test("leaving a lesson with the browser back button asks first", async ({ page }) => {
  await startLessonAndAnswerOne(page);

  await page.goBack();
  await expect(dialogTitle(page)).toBeVisible();
  await page.getByRole("button", { name: "Seguir aquí", exact: true }).click();
  await expect(page.getByText("Ejercicio 1 de 6")).toBeVisible();
  await expect(page).toHaveURL(/\/lesson\//);

  await page.goBack();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.getByText("Lecciones de nivel A2")).toBeVisible();
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
});

test("leaving before answering does not ask", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();
  await skipLessonIntro(page);
  await expect(page.getByText("Ejercicio 1 de 6")).toBeVisible();

  await page.goBack();
  await expect(page.getByText("Lecciones de nivel A2")).toBeVisible();
});
