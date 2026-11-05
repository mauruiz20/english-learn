import { expect, test, type ConsoleMessage } from "./support/test";
import { currentExerciseId, playSessionCorrectly } from "./support/content";

// `?today=` is a test-only clock override, compiled in only with EXPO_PUBLIC_E2E=1.
const DAY_1 = "2030-01-01";
const DAY_2 = "2030-01-02";
const FIRST_PATH_LESSON = "Mi rutina diaria";

test("free practice: a phrasal-verbs lesson gets its result, leaves the path alone and comes back in review", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto(`/?today=${DAY_1}`);
  await expect(page.getByRole("button", { name: FIRST_PATH_LESSON, exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: /^Práctica libre: .*Phrasal verbs.*, a tu ritmo$/ })
    .click();

  await expect(page.getByRole("heading", { name: "Práctica libre", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Phrasal verbs: \d+ grupos, \d+ lecciones$/ }).click();

  await expect(page.getByRole("heading", { name: "Phrasal verbs", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Casa y rutina, nivel A2" })).toBeVisible();
  await page.getByRole("button", { name: "Casa y rutina: conócelos, nueva", exact: true }).click();

  const answered = await playSessionCorrectly(page, "¡Lección completada!");
  expect(answered).toBeGreaterThanOrEqual(6);
  await expect(page.getByText("Lo nuevo de hoy")).toBeVisible();
  await page.getByRole("button", { name: "Volver a Phrasal verbs", exact: true }).click();

  // Back on the groups: the lesson's best result, like a lesson on the path.
  const perfect = `completada sin errores: ${answered} de ${answered} correctas`;
  const row = page.getByRole("button", {
    name: `Casa y rutina: conócelos, ${perfect}`,
    exact: true,
  });
  await expect(row).toBeVisible();
  await expect(row.getByText(`Perfecta · ${answered}/${answered}`)).toBeVisible();

  // The path has not moved: its first lesson is still not done, and nothing on it is.
  await page.goto(`/?today=${DAY_1}`);
  await expect(page.getByRole("button", { name: FIRST_PATH_LESSON, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /completada/ })).toHaveCount(0);
  await expect(page.getByText("Nada para repasar hoy")).toBeVisible();

  // The next day its verbs come back in the daily review.
  await page.goto(`/?today=${DAY_2}`);
  await expect(page.getByText(/^\d+ pendientes?$/)).toBeVisible();
  await page.getByRole("button", { name: "Repasar", exact: true }).click();
  await expect(page.locator('[data-testid^="exercise-"]').first()).toBeVisible();
  expect(await currentExerciseId(page)).toMatch(/^a2\.phrasal-verbs\.practice-home-/);
  const reviewed = await playSessionCorrectly(page, "¡Repaso completado!");
  expect(reviewed).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

// The collections added after phrasal verbs: each is listed, opens on its first group and plays
// its first lesson to the end.
const NEW_COLLECTIONS = [
  { title: "Tiempos verbales", group: "Presente simple y continuo", lesson: "conócelos" },
  { title: "Situaciones", group: "En el aeropuerto", lesson: "frases clave" },
  { title: "Gramática", group: "Artículos", lesson: "conócelos" },
] as const;

for (const { title, group, lesson } of NEW_COLLECTIONS) {
  test(`free practice: the ${title} collection is listed and its first lesson plays`, async ({
    page,
  }) => {
    const problems: string[] = [];
    page.on("console", (message: ConsoleMessage) => {
      if (message.type() === "error") problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(error.message));

    await page.goto(`/?today=${DAY_1}`);
    await page.getByRole("button", { name: /^Práctica libre: .*, a tu ritmo$/ }).click();
    await expect(page.getByRole("heading", { name: "Práctica libre", exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: new RegExp(`^${title}: \\d+ grupos, \\d+ lecciones$`) })
      .click();

    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: `${group}, nivel A2` })).toBeVisible();
    await page.getByRole("button", { name: `${group}: ${lesson}, nueva`, exact: true }).click();

    const answered = await playSessionCorrectly(page, "¡Lección completada!");
    expect(answered).toBeGreaterThanOrEqual(6);
    await page.getByRole("button", { name: `Volver a ${title}`, exact: true }).click();
    const perfect = `completada sin errores: ${answered} de ${answered} correctas`;
    await expect(
      page.getByRole("button", { name: `${group}: ${lesson}, ${perfect}`, exact: true }),
    ).toBeVisible();
    expect(problems).toEqual([]);
  });
}
