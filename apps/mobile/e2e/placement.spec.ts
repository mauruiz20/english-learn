import { expect, test } from "./support/test";
import { answerCorrectly, lessonsOfLevel } from "./support/content";

test("placement: answering everything correctly places at C1, shows the C1 path and every level", async ({
  page,
}) => {
  expect(lessonsOfLevel("C1").length).toBeGreaterThan(0);
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
  await expect(page.getByText("Te mostraremos las lecciones de nivel C1.")).toBeVisible();
  await page.getByRole("button", { name: "Ir a mis lecciones", exact: true }).click();

  await expect(page.getByText("Tu nivel: C1")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lecciones de nivel C1" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: lessonsOfLevel("C1")[0]!.title, exact: true }),
  ).toBeVisible();
  // Placement never touches XP or the streak.
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Tu nivel: C1")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lecciones de nivel C1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Repetir test de nivel" })).toBeVisible();

  // The path's level picker lists every level from A1 to C1, C1 as the automatic one.
  const picker = page.getByRole("button", { name: /^Nivel del recorrido: / });
  await expect(picker).toHaveAccessibleName("Nivel del recorrido: C1, automático");
  await picker.click();
  await expect(
    page.getByRole("radio", { name: "Automático, ahora C1", exact: true }),
  ).toBeVisible();
  const levels = page.getByRole("radio", { name: /^[ABC][12], \d+ % completado$/ });
  await expect(levels).toHaveCount(5);
  for (const level of ["A1", "A2", "B1", "B2", "C1"]) {
    await expect(
      page.getByRole("radio", { name: `${level}, 0 % completado`, exact: true }),
    ).toBeVisible();
  }
});
