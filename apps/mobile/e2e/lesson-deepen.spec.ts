import type { Locator, Page } from "@playwright/test";
import { expect, test, type ConsoleMessage } from "./support/test";
import {
  answerPlacementAs,
  answerWrongly,
  playSessionCorrectly,
  skipLessonIntro,
} from "./support/content";

// `?today=` is a test-only clock override, compiled in only with EXPO_PUBLIC_E2E=1.
const DAY_1 = "2030-01-01";
const DAY_2 = "2030-01-02";
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

/** Home's way to the study cards: "Fichas: 75 fichas, 2 estudiadas". */
function cardsButton(page: Page): Locator {
  return page.getByRole("button", { name: /^Fichas: \d+ fichas, \d+ estudiadas?$/ });
}

/** How many cards home counts as studied. */
async function studiedCards(page: Page): Promise<number> {
  const name = await cardsButton(page).getAttribute("aria-label");
  return Number(name?.match(/(\d+) estudiadas?$/)?.[1]);
}

/** The summary's XP, read from its label (the number on screen counts up). */
async function earnedXp(page: Page): Promise<number> {
  const label = page.getByLabel(/^XP ganada: \d+$/);
  return Number((await label.getAttribute("aria-label"))?.replace(/\D/g, ""));
}

// One journey through a lesson and its study card: the lesson (with a mistake, then redone), its
// recap, the recap's card link, the card itself, its practice, and the results that come back on
// the path, in the card list and in the next day's review.
test("lesson to card: a lesson recaps its new items and links its study card, whose practice shows on the path, in the card list and in review @chromium", async ({
  page,
}) => {
  // Placement, two plays of a lesson, two card practices and a review.
  test.setTimeout(120_000);
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto(`/?today=${DAY_1}`);
  await expect(cardsButton(page)).toHaveAccessibleName(/^Fichas: \d+ fichas, 0 estudiadas$/);
  await placeAtB1(page);

  // Not done yet: no deepen step on the path.
  const step = page.getByRole("button", { name: new RegExp(`^Profundiza: ${escape(CARD)}, `) });
  await expect(page.getByRole("button", { name: LESSON, exact: true })).toBeVisible();
  await expect(step).toHaveCount(0);

  // The lesson: one mistake on the first exercise, then everything right.
  await page.getByRole("button", { name: LESSON, exact: true }).click();
  await skipLessonIntro(page);
  await answerWrongly(page, "Comprobar");
  await expect(page.getByRole("alert")).toContainText("Incorrecto");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  const right = await playSessionCorrectly(page, "¡Lección completada!");
  const total = right + 1;
  await expect(page.getByText(`Aciertos: ${right} de ${total}`)).toBeVisible();
  // Answer XP plus the first-completion bonus (right / total ≥ 80 %).
  expect(right / total).toBeGreaterThanOrEqual(0.8);
  await expect(page.getByText(`XP ganada: ${right * 10 + 20}`, { exact: true })).toBeVisible();

  // "Lo nuevo de hoy": meaning and example for its items, and the lesson's own "look forward to"
  // item opens the linked card, although the card teaches it with an item of its own.
  const recap = page.getByTestId("summary-recap");
  await expect(recap.getByRole("heading", { name: "Lo nuevo de hoy" })).toBeVisible();
  await expect(recap.getByText("público, espectadores", { exact: true })).toBeVisible();
  await expect(recap.getByText("The audience loved the concert.")).toBeVisible();
  await recap.getByRole("button", { name: `Ver ficha: ${CARD}`, exact: true }).click();

  // The card: the form on its ruled card and the mistakes struck in red pen.
  await expect(page.getByRole("heading", { name: CARD, exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Estructura: look forward to + sustantivo / verbo-ing", { exact: true }),
  ).toBeVisible();
  const mistake = page.getByLabel("Incorrecto: I look forward to see you.", { exact: true });
  await expect(mistake).toBeVisible();
  expect(await mistake.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain(
    "line-through",
  );
  // Example words can be looked up.
  // (Scrolled into view first: scrolling closes an open lookup.)
  const weekend = page.getByRole("button", { name: "weekend, ver traducción" }).first();
  await weekend.scrollIntoViewIfNeeded();
  await expect(weekend).toBeInViewport();
  await weekend.click();
  await expect(page.getByRole("dialog", { name: "Traducción de weekend" })).toBeVisible();
  await page.keyboard.press("Escape");
  // Never practiced: no result yet.
  await expect(page.getByLabel(/^Tu mejor resultado/)).toHaveCount(0);
  await page.goBack();
  await expect(page.getByTestId("summary-recap")).toBeVisible();

  // Home: the lesson's result on the path, and the step under it, new until the card is practiced.
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  const withMistakes = page.getByRole("button", {
    name: `${LESSON}, completada con errores: ${right} de ${total} correctas`,
  });
  await expect(withMistakes).toBeVisible();
  await expect(page.getByText(`Completada · ${right}/${total}`)).toBeVisible();
  const fresh = page.getByRole("button", {
    name: `Profundiza: ${CARD}, ficha nueva`,
    exact: true,
  });
  await fresh.scrollIntoViewIfNeeded();
  await expect(fresh).toBeVisible();
  await expect(fresh.getByText("Nueva", { exact: true })).toBeVisible();
  const box = await fresh.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);

  // Redo from the path, all right: answer XP only, no second bonus; the best result counts.
  await withMistakes.click();
  await playSessionCorrectly(page, "¡Lección completada!");
  await expect(page.getByText(`XP ganada: ${total * 10}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: `${LESSON}, completada sin errores: ${total} de ${total} correctas`,
    }),
  ).toBeVisible();
  await expect(page.getByText(`Perfecta · ${total}/${total}`)).toBeVisible();
  // The lesson's items may complete other cards; the linked card is still new.
  const studiedBefore = await studiedCards(page);

  // The step opens the card; practicing it pays the first-completion bonus once.
  await fresh.scrollIntoViewIfNeeded();
  await fresh.click();
  await expect(page.getByRole("heading", { name: CARD, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Practicar", exact: true }).click();
  const answered = await playSessionCorrectly(page, "¡Práctica completada!");
  expect(answered).toBeGreaterThanOrEqual(6);
  expect(await earnedXp(page)).toBeGreaterThan(answered * 10);
  await page.getByRole("button", { name: "Volver a la ficha", exact: true }).click();
  await expect(page.getByText("Estudiada", { exact: true })).toBeVisible();
  const perfect = `completada sin errores: ${answered} de ${answered} correctas`;
  await expect(page.getByLabel(`Tu mejor resultado: ${perfect}`, { exact: true })).toBeVisible();
  await expect(
    page.getByTestId("screen-footer").getByText(`Perfecta · ${answered}/${answered}`),
  ).toBeVisible();
  // Practicing again pays its answers only.
  await page.getByRole("button", { name: "Practicar de nuevo", exact: true }).click();
  await playSessionCorrectly(page, "¡Práctica completada!");
  await expect(page.getByText(`XP ganada: ${answered * 10}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver a la ficha", exact: true }).click();
  await expect(page.getByLabel(`Tu mejor resultado: ${perfect}`, { exact: true })).toBeVisible();

  // Home, after a reload (it lives in the event log): the step shows the card's best result and
  // the card count includes it.
  await page.goto(`/?today=${DAY_1}`);
  await expect(cardsButton(page)).toHaveAccessibleName(
    new RegExp(`^Fichas: \\d+ fichas, ${studiedBefore + 1} estudiadas?$`),
  );
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
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 360, height: 800 });
  await practiced.scrollIntoViewIfNeeded();
  await expectOneLine(practiced, marker);
  if (viewport !== null) await page.setViewportSize(viewport);

  // The card list shows it studied with its result; cards never practiced show nothing new.
  await cardsButton(page).click();
  await expect(page.getByRole("heading", { name: "Fichas", exact: true })).toBeVisible();
  const row = page.getByRole("button", {
    name: `${CARD}, B1, estudiada, ${perfect}`,
    exact: true,
  });
  await expect(row).toBeVisible();
  await expect(row.getByText(`Perfecta · ${answered}/${answered}`)).toBeVisible();
  // (Visible only: home stays mounted under the list.)
  await expect(page.getByText(/^(Perfecta|Completada) · /).filter({ visible: true })).toHaveCount(
    1,
  );

  // The next day, the lesson's items are due for review. Home counts the exercises the review
  // serves, exactly as the review shows them.
  await page.goto(`/?today=${DAY_2}`);
  const pending = page.getByText(/^\d+ pendientes?$/);
  await expect(pending).toBeVisible();
  const count = Number((await pending.textContent())?.match(/\d+/)?.[0]);
  expect(count).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Repasar", exact: true }).click();
  await expect(page.getByText(`Ejercicio 1 de ${count}`, { exact: true })).toBeVisible();

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
