import { expect, test } from "./support/test";
import { answerCorrectly, levelsWithLessons } from "./support/content";

// C1 lessons may not be bundled yet: until then a C1 learner gets the B2 ones.
const C1_LESSON_LEVEL = levelsWithLessons().includes("C1") ? "C1" : "B2";

test("placement: answering everything correctly places at C1 and lists its lessons", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Hacer test de nivel" }).click();

  await expect(page.getByText(/de 15 a 20 preguntas/)).toBeVisible();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();

  const result = page.getByText(/^Tu nivel estimado/);
  let asked = 0;
  await expect(page.getByText("Pregunta 1 de hasta 20")).toBeVisible();
  while (!(await result.isVisible())) {
    asked += 1;
    const id = await answerCorrectly(page, "Siguiente");
    // No feedback: the next question (or, after saving, the result) replaces this one.
    await expect(page.getByTestId(`exercise-${id}`)).toHaveCount(0);
    await expect(result.or(page.getByText(`Pregunta ${asked + 1} de hasta 20`))).toBeVisible();
  }
  expect(asked).toBeGreaterThanOrEqual(15);
  expect(asked).toBeLessThanOrEqual(20);

  await expect(page.getByLabel("Tu nivel estimado: C1")).toBeVisible();
  await expect(
    page.getByText(
      C1_LESSON_LEVEL === "C1"
        ? "Te mostraremos las lecciones de nivel C1."
        : /Te recomendamos las de nivel B2/,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ir a mis lecciones", exact: true }).click();

  await expect(page.getByText("Tu nivel: C1")).toBeVisible();
  await expect(page.getByText(`Lecciones de nivel ${C1_LESSON_LEVEL}`)).toBeVisible();
  // Placement never touches XP or the streak.
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Tu nivel: C1")).toBeVisible();
  await expect(page.getByText(`Lecciones de nivel ${C1_LESSON_LEVEL}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Repetir test de nivel" })).toBeVisible();
});
