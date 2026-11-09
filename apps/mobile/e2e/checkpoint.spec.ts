import { expect, test } from "./support/test";
import type { Page } from "@playwright/test";
import { answerPlacementAs, playSessionCorrectly } from "./support/content";

const DAY_1 = "2030-01-01";
const SOURCE_LESSON = "a1.greetings.lesson-002";
const SOURCE_LESSON_TITLE = "¿Cómo te llamas?";
const DAY_MS = 24 * 60 * 60 * 1_000;

async function placeAtA1(page: Page) {
  await page.getByRole("button", { name: "Hacer test de nivel" }).click();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  const result = page.getByText(/^Tu nivel estimado/);
  let asked = 0;
  while (!(await result.isVisible())) {
    asked += 1;
    await answerPlacementAs(page, "beginner");
    await expect(result.or(page.getByText(`Pregunta ${asked + 1} de hasta 20`))).toBeVisible();
  }
  await expect(page.getByLabel("Tu nivel estimado: A1")).toBeVisible();
  await page.getByRole("button", { name: "Ir a mis lecciones", exact: true }).click();
}

test("A1 checkpoint stays gated for 24 hours, then saves its own result", async ({ page }) => {
  const firstCompletion = new Date(`${DAY_1}T09:00:00`);
  await page.clock.install({ time: firstCompletion });
  await page.goto(`/?today=${DAY_1}`);
  await placeAtA1(page);

  await page.getByRole("button", { name: SOURCE_LESSON_TITLE, exact: true }).click();
  await playSessionCorrectly(page, "¡Lección completada!");
  const sourceCompletedAt = await page.evaluate(() => Date.now());
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await expect(page.getByText(/disponible cuando hayan pasado 24 horas/)).toBeVisible();

  await page.goto(`/comprobacion?today=${DAY_1}`);
  await expect(page.getByText(/disponible cuando hayan pasado 24 horas/)).toBeVisible();
  await expect(page.getByText("Te presentas a una persona nueva en el trabajo.")).toHaveCount(0);
  await page.goto("/?today=2030-01-02");
  await page.clock.setSystemTime(new Date(sourceCompletedAt + DAY_MS));
  await expect(page.getByRole("button", { name: "Hacer comprobación", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hacer comprobación", exact: true }).click();

  const questions = [
    {
      context: "Te presentas a una persona nueva en el trabajo.",
      utterance: "My name is Leo.",
      answer: "Me llamo Leo.",
    },
    {
      context: "Conoces a una persona nueva en clase y quieres preguntarle su nombre.",
      utterance: "What's your name?",
      answer: "¿Cómo te llamas?",
    },
    {
      context: "Conoces a Ana por primera vez y quieres expresar que te da gusto conocerla.",
      utterance: "Nice to meet you.",
      answer: "Mucho gusto.",
    },
  ];
  for (const question of questions) {
    await expect(page.getByText(question.context, { exact: true })).toBeVisible();
    await expect(page.getByText(question.utterance, { exact: true })).toBeVisible();
    await page.getByRole("radio", { name: question.answer, exact: true }).click();
    await page.getByRole("button", { name: "Comprobar", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Correcto");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
  }

  await expect(page.getByText("3 de 3 respuestas correctas", { exact: true })).toBeVisible();
  await expect(page.getByText(/Este resultado corresponde solo a esta comprobación/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar resultado", exact: true }).click();
  await expect(page.getByText("Resultado de la comprobación", { exact: true })).toBeVisible();
  await expect(page.getByText(/3 de 3 respuestas correctas/)).toBeVisible();
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();

  await expect(page.getByText(/3 de 3 respuestas correctas/)).toBeVisible();
  await expect(page.getByText(/3 de 3 respuestas correctas ·/)).toBeVisible();
  await expect(page.getByText(/2 ene 2030/)).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(`/lesson/${SOURCE_LESSON}$`));
  await page.reload();
  await expect(page.getByText(/3 de 3 respuestas correctas ·/)).toBeVisible();
});
