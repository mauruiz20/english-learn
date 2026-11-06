import type { Page } from "@playwright/test";
import { expect, test, type ConsoleMessage } from "./support/test";
import {
  answerPlacementAs,
  lessonsOfLevel,
  levelsWithLessons,
  playSessionCorrectly,
} from "./support/content";

// `?today=` is a test-only clock override, compiled in only with EXPO_PUBLIC_E2E=1.
const DAY_1 = "2030-01-01";
const A1_LESSONS = lessonsOfLevel("A1");
const FIRST_LESSON = A1_LESSONS[0]?.title ?? "";

/**
 * Takes the placement test as a true beginner: every answer wrong. (Getting only the A1
 * questions right already estimates A2.)
 */
async function placeAtA1(page: Page) {
  await page.getByRole("button", { name: "Hacer test de nivel" }).click();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  const result = page.getByText(/^Tu nivel estimado/);
  let asked = 0;
  await expect(page.getByText("Pregunta 1 de hasta 20")).toBeVisible();
  while (!(await result.isVisible())) {
    asked += 1;
    await answerPlacementAs(page, "beginner");
    await expect(result.or(page.getByText(`Pregunta ${asked + 1} de hasta 20`))).toBeVisible();
  }
  await expect(page.getByLabel("Tu nivel estimado: A1")).toBeVisible();
  await expect(page.getByText("Te mostraremos las lecciones de nivel A1.")).toBeVisible();
  await page.getByRole("button", { name: "Ir a mis lecciones", exact: true }).click();
}

function levelPicker(page: Page) {
  return page.getByRole("button", { name: /^Nivel del recorrido: / });
}

test("A1: a learner placed at A1 gets the A1 path, does its first lesson and can pick A1", async ({
  page,
}) => {
  expect(A1_LESSONS.length).toBeGreaterThan(0);
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto(`/?today=${DAY_1}`);
  await placeAtA1(page);

  // The A1 section, its first lesson where Avi waits.
  await expect(page.getByRole("heading", { name: "Lecciones de nivel A1" })).toBeVisible();
  await expect(levelPicker(page)).toHaveAccessibleName("Nivel del recorrido: A1, automático");
  const first = page.getByRole("button", { name: FIRST_LESSON, exact: true });
  await expect(first).toBeVisible();

  await first.click();
  await playSessionCorrectly(page, "¡Lección completada!");

  // Home: the lesson is done and the path stays on A1.
  await page.goto(`/?today=${DAY_1}`);
  await expect(page.getByRole("heading", { name: "Lecciones de nivel A1" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: new RegExp(`^${FIRST_LESSON}, completada`) }),
  ).toBeVisible();

  // The picker lists A1 with its progress, and exactly the levels that have lessons.
  await levelPicker(page).click();
  const percent = Math.round((1 / A1_LESSONS.length) * 100);
  await expect(
    page.getByRole("radio", { name: `A1, ${percent} % completado`, exact: true }),
  ).toBeVisible();
  const levels = page.getByRole("radio", { name: /^[ABC][12], \d+ % completado$/ });
  await expect(levels).toHaveCount(levelsWithLessons().length);
  for (const level of levelsWithLessons()) {
    await expect(page.getByRole("radio", { name: new RegExp(`^${level}, `) })).toBeVisible();
  }
  expect(problems).toEqual([]);
});
