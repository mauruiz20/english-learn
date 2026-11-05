import type { Locator, Page } from "@playwright/test";
import { expect, test, type ConsoleMessage } from "./support/test";
import { answerPlacementAs, playSessionCorrectly } from "./support/content";

// `?today=` is a test-only clock override, compiled in only with EXPO_PUBLIC_E2E=1.
const DAY_1 = "2030-01-01";
const LESSON = "Una noche de cultura";
const CARD = "Look forward to + -ing";

/** Takes the placement test as a B1 learner (right up to B1, wrong above), which lists B1. */
async function placeAtB1(page: Page) {
  await page.getByRole("button", { name: "Hacer test de nivel" }).click();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  const result = page.getByText(/^Tu nivel estimado/);
  let asked = 0;
  await expect(page.getByText("Pregunta 1 de hasta 20")).toBeVisible();
  while (!(await result.isVisible())) {
    asked += 1;
    await answerPlacementAs(page, "b1");
    await expect(result.or(page.getByText(`Pregunta ${asked + 1} de hasta 20`))).toBeVisible();
  }
  await expect(page.getByLabel("Tu nivel estimado: B1")).toBeVisible();
  await page.getByRole("button", { name: "Ir a mis lecciones", exact: true }).click();
  await expect(page.getByText("Lecciones de nivel B1")).toBeVisible();
}

test("deepen: a done lesson links its study card in the recap and on the path, with its result", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto(`/?today=${DAY_1}`);
  await placeAtB1(page);

  // Not done yet: no step on the path.
  const step = page.getByRole("button", { name: new RegExp(`^Profundiza: ${escape(CARD)}, `) });
  await expect(page.getByRole("button", { name: LESSON, exact: true })).toBeVisible();
  await expect(step).toHaveCount(0);

  await page.getByRole("button", { name: LESSON, exact: true }).click();
  await playSessionCorrectly(page, "¡Lección completada!");

  // "Lo nuevo de hoy": the lesson's own "look forward to" item opens the linked card, although
  // the card teaches it with an item of its own.
  const recap = page.getByTestId("summary-recap");
  await expect(recap.getByRole("heading", { name: "Lo nuevo de hoy" })).toBeVisible();
  await recap.getByRole("button", { name: `Ver ficha: ${CARD}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: CARD, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("summary-recap")).toBeVisible();

  // Home: the step sits under the done lesson, new until the card is practiced.
  await page.goto(`/?today=${DAY_1}`);
  const fresh = page.getByRole("button", { name: `Profundiza: ${CARD}, ficha nueva`, exact: true });
  await fresh.scrollIntoViewIfNeeded();
  await expect(fresh).toBeVisible();
  await expect(fresh.getByText("Nueva", { exact: true })).toBeVisible();
  const box = await fresh.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);

  // It opens the card; practicing it gives the step the card's best result.
  await fresh.click();
  await expect(page.getByRole("heading", { name: CARD, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Practicar", exact: true }).click();
  const answered = await playSessionCorrectly(page, "¡Práctica completada!");
  await page.getByRole("button", { name: "Volver a la ficha", exact: true }).click();
  const perfect = `completada sin errores: ${answered} de ${answered} correctas`;
  await expect(page.getByLabel(`Tu mejor resultado: ${perfect}`, { exact: true })).toBeVisible();

  await page.goto(`/?today=${DAY_1}`);
  const practiced = page.getByRole("button", {
    name: `Profundiza: ${CARD}, ${perfect}`,
    exact: true,
  });
  await practiced.scrollIntoViewIfNeeded();
  await expect(practiced).toBeVisible();
  const marker = practiced.getByText(`Perfecta · ${answered}/${answered}`);
  await expect(marker).toBeVisible();
  await expectOneLine(practiced, marker);

  // On a narrow phone the title wraps and the marker goes under it, never broken.
  await page.setViewportSize({ width: 360, height: 800 });
  await practiced.scrollIntoViewIfNeeded();
  await expectOneLine(practiced, marker);
  expect(problems).toEqual([]);
});

/** The step's marker sits on a single line (as tall as the one-line "Profundiza"), inside it. */
async function expectOneLine(step: Locator, marker: Locator) {
  const [label, text, row] = await Promise.all([
    step.getByText("Profundiza", { exact: true }).boundingBox(),
    marker.boundingBox(),
    step.boundingBox(),
  ]);
  expect(label && text && row).toBeTruthy();
  expect(text!.height).toBeLessThan(label!.height * 1.5);
  expect(text!.x + text!.width).toBeLessThanOrEqual(row!.x + row!.width);
}

/** `text` as a literal inside a regular expression. */
function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
