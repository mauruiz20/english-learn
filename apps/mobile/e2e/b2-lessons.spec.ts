import type { Page } from "@playwright/test";
import { expect, test, type ConsoleMessage } from "./support/test";
import { placementTakerAt, playSessionCorrectly } from "./support/content";

// `?today=` is a test-only clock override, compiled in only with EXPO_PUBLIC_E2E=1.
const DAY_1 = "2030-01-01";
const FIRST_LESSON = "Un planeta más caliente";
const CARD = "Raise o rise";

/** Takes the placement test as a B2 learner (see `placementTakerAt`). */
async function placeAtB2(page: Page) {
  const answerAsB2 = placementTakerAt("b2");
  await page.getByRole("button", { name: "Hacer test de nivel" }).click();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  const result = page.getByText(/^Tu nivel estimado/);
  let asked = 0;
  await expect(page.getByText("Pregunta 1 de hasta 20")).toBeVisible();
  while (!(await result.isVisible())) {
    asked += 1;
    await answerAsB2(page);
    await expect(result.or(page.getByText(`Pregunta ${asked + 1} de hasta 20`))).toBeVisible();
  }
  await expect(
    page.getByText(/Te recomendamos las de nivel B2|Te mostraremos las lecciones de nivel B2/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ir a mis lecciones", exact: true }).click();
}

test("B2: a learner placed at B2 gets the B2 path, does its first lesson and sees its card", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto(`/?today=${DAY_1}`);
  await placeAtB2(page);

  // The B2 section, its first topic and its first lesson, where Avi waits.
  await expect(page.getByRole("heading", { name: "Lecciones de nivel B2" })).toBeVisible();
  await expect(page.getByText("Clima y medio ambiente", { exact: true }).first()).toBeVisible();
  const first = page.getByRole("button", { name: FIRST_LESSON, exact: true });
  await expect(first).toBeVisible();
  await expect(page.getByRole("button", { name: /^Profundiza: / })).toHaveCount(0);

  await first.click();
  await playSessionCorrectly(page, "¡Lección completada!");

  // "Lo nuevo de hoy" links the lesson's rise / raise items to the linked card.
  const recap = page.getByTestId("summary-recap");
  await expect(recap.getByRole("heading", { name: "Lo nuevo de hoy" })).toBeVisible();
  await expect(recap.getByRole("button", { name: `Ver ficha: ${CARD}` }).first()).toBeVisible();

  // Home: the lesson is done and its "Profundiza" step opens the card.
  await page.goto(`/?today=${DAY_1}`);
  await expect(page.getByRole("heading", { name: "Lecciones de nivel B2" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: new RegExp(`^${FIRST_LESSON}, completada`) }),
  ).toBeVisible();
  const step = page.getByRole("button", { name: `Profundiza: ${CARD}, ficha nueva`, exact: true });
  await step.scrollIntoViewIfNeeded();
  await expect(step).toBeVisible();
  await step.click();
  await expect(page.getByRole("heading", { name: CARD, exact: true })).toBeVisible();
  expect(problems).toEqual([]);
});
