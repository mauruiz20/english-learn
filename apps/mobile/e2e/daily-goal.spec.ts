import type { Page } from "@playwright/test";
import { expect, test, type ConsoleMessage } from "./support/test";
import { lessonsOfLevel, playSessionCorrectly } from "./support/content";

// `?today=` is a test-only clock override, compiled in only with EXPO_PUBLIC_E2E=1.
const DAY_1 = "2030-01-01";
const DAY_2 = "2030-01-02";
// Without a placement the path starts on A2.
const [FIRST, SECOND] = lessonsOfLevel("A2");

const PROMPT = "¿Cuánto quieres practicar cada día?";

function goalMeter(page: Page) {
  return page.getByRole("progressbar", { name: /^(Meta diaria|¡Meta cumplida!)/ });
}

function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

/** Plays a path lesson from home and returns how many exercises it had. */
async function playLesson(page: Page, title: string): Promise<number> {
  await page.getByRole("button", { name: title, exact: true }).click();
  return playSessionCorrectly(page, "¡Lección completada!");
}

test("daily goal: picked once, counts lessons, is met, and starts again the next day", async ({
  page,
}) => {
  const problems = watchProblems(page);
  if (FIRST === undefined || SECOND === undefined) throw new Error("A2 needs two lessons");

  await page.goto(`/?today=${DAY_1}`);
  // The note asks once, without blocking the path.
  await expect(page.getByText(PROMPT)).toBeVisible();
  await expect(page.getByText("Lecciones de nivel A2")).toBeVisible();
  await page.getByRole("button", { name: "Suave · 10", exact: true }).click();
  await expect(page.getByText(PROMPT)).toBeHidden();
  await expect(goalMeter(page)).toHaveAccessibleName("Meta diaria: 0 de 10 ejercicios hoy");
  await expect(page.getByText("0 / 10 hoy")).toBeVisible();

  const first = await playLesson(page, FIRST.title);
  await expect(page.getByText(`Meta diaria: ${first} / 10`)).toBeVisible();
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await expect(goalMeter(page)).toHaveAccessibleName(`Meta diaria: ${first} de 10 ejercicios hoy`);
  await expect(page.getByText(`${first} / 10 hoy`)).toBeVisible();

  const second = await playLesson(page, SECOND.title);
  expect(first + second).toBeGreaterThanOrEqual(10);
  await expect(page.getByText("¡Cumpliste tu meta de hoy!")).toBeVisible();
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await expect(goalMeter(page)).toHaveAccessibleName(
    `¡Meta cumplida! ${first + second} de 10 ejercicios hoy`,
  );
  await expect(page.getByTestId("daily-goal").getByText("¡Meta cumplida!")).toBeVisible();

  // A new day starts from zero; the goal and the answered note stay.
  await page.goto(`/?today=${DAY_2}`);
  await expect(goalMeter(page)).toHaveAccessibleName("Meta diaria: 0 de 10 ejercicios hoy");
  await expect(page.getByText("0 / 10 hoy")).toBeVisible();
  await expect(page.getByText(PROMPT)).toBeHidden();

  expect(problems).toEqual([]);
});

test("daily goal: 'Sin meta' hides the count everywhere, and a goal can be picked again", async ({
  page,
}) => {
  const problems = watchProblems(page);
  if (FIRST === undefined) throw new Error("A2 needs a lesson");

  await page.goto(`/?today=${DAY_1}`);
  await page.getByRole("button", { name: "Sin meta", exact: true }).click();
  await expect(page.getByText(PROMPT)).toBeHidden();
  await expect(page.getByRole("button", { name: "Meta diaria: Sin meta" })).toBeVisible();
  await expect(goalMeter(page)).toHaveCount(0);

  const answered = await playLesson(page, FIRST.title);
  await expect(page.getByText("Aciertos:", { exact: false })).toBeVisible();
  // The summary has no goal line (home underneath keeps only its "Sin meta" chip).
  await expect(page.getByText(/Meta diaria: \d+ \/ \d+|meta de hoy/)).toHaveCount(0);
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await expect(goalMeter(page)).toHaveCount(0);

  // Back to a goal from the progress card: today's lesson already counts.
  await page.getByRole("button", { name: "Meta diaria: Sin meta" }).click();
  await page.getByRole("radio", { name: "Normal · 20", exact: true }).click();
  await expect(goalMeter(page)).toHaveAccessibleName(
    `Meta diaria: ${answered} de 20 ejercicios hoy`,
  );

  expect(problems).toEqual([]);
});
