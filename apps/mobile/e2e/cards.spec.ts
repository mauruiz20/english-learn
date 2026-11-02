import { expect, test, type ConsoleMessage } from "./support/test";
import { playSessionCorrectly } from "./support/content";

// `?today=` is a test-only clock override, compiled in only with EXPO_PUBLIC_E2E=1.
const DAY_1 = "2030-01-01";
const CARD = "Look forward to + -ing";

test("study cards: open one from home, read it, practice it, see it studied with its best result", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto(`/?today=${DAY_1}`);
  await page.getByRole("button", { name: /^Fichas: \d+ fichas, 0 estudiadas$/ }).click();
  await expect(page.getByRole("heading", { name: "Fichas", exact: true })).toBeVisible();
  await page.getByRole("button", { name: `${CARD}, B1`, exact: true }).click();

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
  await page.getByRole("button", { name: "Practicar", exact: true }).click();
  const answered = await playSessionCorrectly(page, "¡Práctica completada!");
  expect(answered).toBeGreaterThanOrEqual(6);
  // Answer XP plus the first-completion bonus (read from the label: the number counts up).
  const firstXp = Number(
    (await page.getByLabel(/^XP ganada: \d+$/).getAttribute("aria-label"))?.replace(/\D/g, ""),
  );
  expect(firstXp).toBeGreaterThan(answered * 10);
  await page.getByRole("button", { name: "Volver a la ficha", exact: true }).click();

  await expect(page.getByText("Estudiada", { exact: true })).toBeVisible();
  // The best result, like a perfect lesson's on the path, and practicing again.
  const perfect = `completada sin errores: ${answered} de ${answered} correctas`;
  await expect(page.getByLabel(`Tu mejor resultado: ${perfect}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Perfecta · ${answered}/${answered}`)).toBeVisible();
  await page.getByRole("button", { name: "Practicar de nuevo", exact: true }).click();
  await playSessionCorrectly(page, "¡Práctica completada!");
  // The redo pays its answers only: the bonus was paid once.
  await expect(page.getByText(`XP ganada: ${answered * 10}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver a la ficha", exact: true }).click();
  await expect(page.getByLabel(`Tu mejor resultado: ${perfect}`, { exact: true })).toBeVisible();

  await page.goBack();
  const row = page.getByRole("button", { name: `${CARD}, B1, estudiada, ${perfect}`, exact: true });
  await expect(row).toBeVisible();
  await expect(row.getByText(`Perfecta · ${answered}/${answered}`)).toBeVisible();
  // Cards never practiced show nothing new.
  await expect(page.getByText(/^(Perfecta|Completada) · /)).toHaveCount(1);

  // Home counts it too, after a reload (it lives in the event log).
  await page.goto(`/?today=${DAY_1}`);
  await expect(
    page.getByRole("button", { name: /^Fichas: \d+ fichas, 1 estudiada$/ }),
  ).toBeVisible();
  expect(problems).toEqual([]);
});

test("study cards: 'Ver ficha' after a missed lesson exercise opens the card and comes back", async ({
  page,
}) => {
  await page.goto(`/?today=${DAY_1}`);
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();

  // The lesson's first exercise practices "wake up", taught by the daily-routine phrasal verbs card.
  const exercise = page.getByTestId("exercise-a2.daily-routine.vocab-001");
  await exercise.getByRole("radio", { name: "dormirse", exact: true }).click();
  await exercise.getByRole("button", { name: "Comprobar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrecto");
  await page
    .getByRole("button", { name: "Ver ficha: Phrasal verbs: la rutina diaria", exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Phrasal verbs: la rutina diaria", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("separable", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Volver al ejercicio", exact: true }).click();

  // Back in the lesson, right where it was: the feedback is still there.
  await expect(page.getByRole("alert")).toContainText("Incorrecto");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText(/^Ejercicio 2 de \d+$/)).toBeVisible();
});
