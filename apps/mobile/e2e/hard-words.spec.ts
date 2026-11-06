import { expect, test, type ConsoleMessage, type Page } from "./support/test";
import { answerCorrectly, answerWrongly, playSessionCorrectly } from "./support/content";

// `?today=` is a test-only clock override, compiled in only with EXPO_PUBLIC_E2E=1.
const DAY_1 = "2030-01-01";
const DAY_3 = "2030-01-03";
const DAY_4 = "2030-01-04";

const EXERCISE = '[data-testid^="exercise-"]';
const FAILED = 2;

async function bucketCount(page: Page, bucket: "mastered" | "learning" | "hard") {
  return Number(await page.getByTestId(`bucket-count-${bucket}`).textContent());
}

/** Home's "N pendientes" (0 when nothing is due). */
async function pendingOnHome(page: Page): Promise<number> {
  const pending = page.getByText(/^\d+ pendientes?$/);
  await expect(pending.or(page.getByText("Nada para repasar hoy"))).toBeVisible();
  if (!(await pending.isVisible())) return 0;
  return Number((await pending.textContent())?.match(/\d+/)?.[0]);
}

test("hard words: missed review words show under Difíciles, can be practiced and move on", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  // Learn some words.
  await page.goto(`/?today=${DAY_1}`);
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();
  await playSessionCorrectly(page, "¡Lección completada!");
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();

  // Two days later: miss the first exercises of the review (lapses), get the rest right.
  await page.goto(`/?today=${DAY_3}`);
  const pending = await pendingOnHome(page);
  expect(pending).toBeGreaterThan(FAILED);
  await page.getByRole("button", { name: "Repasar", exact: true }).click();
  for (let i = 0; i < pending; i++) {
    await expect(page.locator(EXERCISE).first()).toBeVisible();
    if (i < FAILED) await answerWrongly(page, "Comprobar");
    else await answerCorrectly(page, "Comprobar");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
  }
  await expect(page.getByText("¡Repaso completado!")).toBeVisible();
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  // The missed words are due tomorrow: nothing left today.
  await expect(page.getByText("Nada para repasar hoy")).toBeVisible();

  // Tu progreso: the missed words are difficult.
  await page
    .getByRole("button", { name: "Tu progreso: dominadas, en proceso y difíciles" })
    .click();
  await expect(page.getByRole("heading", { name: "Mis palabras difíciles" })).toBeVisible();
  const hard = await bucketCount(page, "hard");
  expect(hard).toBeGreaterThanOrEqual(FAILED);
  const learning = await bucketCount(page, "learning");
  await expect(page.getByRole("img", { name: new RegExp(`, ${hard} difíciles$`) })).toBeVisible();

  // Practice them all correctly.
  await page.getByRole("button", { name: "Practicar mis palabras difíciles", exact: true }).click();
  const practiced = await playSessionCorrectly(page, "¡Práctica completada!");
  expect(practiced).toBeGreaterThan(0);
  expect(practiced).toBeLessThanOrEqual(10);
  await expect(
    page.getByText(
      hard === 1
        ? "1 de 1 palabra difícil avanzó a En proceso."
        : `${hard} de ${hard} palabras difíciles avanzaron a En proceso.`,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Volver a mi progreso", exact: true }).click();

  // The counts moved: nothing difficult any more, all of them in progress.
  await expect(page.getByText("No tienes palabras difíciles. ¡Sigue así!")).toBeVisible();
  expect(await bucketCount(page, "hard")).toBe(0);
  expect(await bucketCount(page, "learning")).toBe(learning + hard);

  // Practicing words that were not due did not move their review: still nothing today, and
  // tomorrow home counts exactly what the review serves.
  await page.goto(`/?today=${DAY_3}`);
  expect(await pendingOnHome(page)).toBe(0);
  await page.goto(`/?today=${DAY_4}`);
  const tomorrow = await pendingOnHome(page);
  expect(tomorrow).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Repasar", exact: true }).click();
  await expect(page.getByText(`Ejercicio 1 de ${tomorrow}`)).toBeVisible();
  const reviewed = await playSessionCorrectly(page, "¡Repaso completado!");
  expect(reviewed).toBe(tomorrow);

  expect(problems).toEqual([]);
});
