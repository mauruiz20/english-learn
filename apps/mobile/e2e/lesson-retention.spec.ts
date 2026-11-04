import { expect, test, type ConsoleMessage } from "./support/test";
import { playSessionCorrectly } from "./support/content";

// `?today=` is a test-only clock override, compiled in only with EXPO_PUBLIC_E2E=1.
const DAY_1 = "2030-01-01";
const DAY_2 = "2030-01-02";

test("a lesson recaps its new items, shows its best result on the path and can be redone", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto(`/?today=${DAY_1}`);
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();

  // One mistake on the first exercise, then everything right: 5 of 6.
  await expect(page.getByText("Ejercicio 1 de 6")).toBeVisible();
  await page.getByRole("radio", { name: "dormirse", exact: true }).click();
  await page.getByRole("button", { name: "Comprobar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrecto");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await playSessionCorrectly(page, "¡Lección completada!");

  await expect(page.getByText("Aciertos: 5 de 6")).toBeVisible();
  // 5 × 10 + the first-completion bonus (5/6 ≥ 80 %).
  await expect(page.getByText("XP ganada: 70")).toBeVisible();

  // "Lo nuevo de hoy": a card link for "wake up", meaning and example for the others.
  const recap = page.getByTestId("summary-recap");
  await expect(recap.getByRole("heading", { name: "Lo nuevo de hoy" })).toBeVisible();
  await expect(recap.getByText("trayecto al trabajo", { exact: true })).toBeVisible();
  await expect(recap.getByText("My commute to work takes thirty minutes.")).toBeVisible();
  await recap
    .getByRole("button", { name: "Ver ficha: Phrasal verbs: la rutina diaria", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Phrasal verbs: la rutina diaria", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByText("Aciertos: 5 de 6")).toBeVisible();

  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  const withMistakes = page.getByRole("button", {
    name: "Mi rutina diaria, completada con errores: 5 de 6 correctas",
  });
  await expect(withMistakes).toBeVisible();
  await expect(page.getByText("Completada · 5/6")).toBeVisible();
  await expect(page.getByText("70 XP", { exact: true })).toBeVisible();

  // Redo from the path, all right: answer XP only, no second bonus; the best result counts.
  await withMistakes.click();
  await playSessionCorrectly(page, "¡Lección completada!");
  await expect(page.getByText("XP ganada: 60")).toBeVisible();
  // The same day: only the first perfect page pays (no new day, no new lesson).
  await expect(page.getByText("Plumas: +10", { exact: true })).toBeVisible();
  await expect(page.getByText("Página perfecta +10", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Mi rutina diaria, completada sin errores: 6 de 6 correctas",
    }),
  ).toBeVisible();
  await expect(page.getByText("Perfecta · 6/6")).toBeVisible();
  await expect(page.getByText("130 XP", { exact: true })).toBeVisible();

  // The next day, all five items of the lesson are due for review.
  await page.goto(`/?today=${DAY_2}`);
  await expect(page.getByText("5 pendientes", { exact: true })).toBeVisible();
  await expect(page.getByText("Perfecta · 6/6")).toBeVisible();

  expect(problems).toEqual([]);
});
