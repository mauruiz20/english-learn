import { expect, test, type ConsoleMessage, type Page } from "./support/test";
import {
  answerCorrectly,
  currentExerciseId,
  isListeningExercise,
  listeningSentence,
  playSessionCorrectly,
} from "./support/content";
import { spoken, stubSpeech } from "./support/speech-stub";

// `?today=` is a test-only clock override, compiled in only with EXPO_PUBLIC_E2E=1.
const DAY_1 = "2030-01-01";
const DAY_3 = "2030-01-03";
const CARD = "Look forward to + -ing";

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

async function openCard(page: Page) {
  await page.goto(`/?today=${DAY_1}`);
  await page.getByRole("button", { name: /^Fichas: \d+ fichas, 0 estudiadas$/ }).click();
  await page.getByRole("button", { name: `${CARD}, B1`, exact: true }).click();
  await expect(page.getByRole("heading", { name: CARD, exact: true })).toBeVisible();
}

const speakers = (page: Page) => page.getByRole("button", { name: /^Escuchar: / });

test("a speaker says its English with an English voice, at the same speed every tap", async ({
  page,
}) => {
  const problems = collectProblems(page);
  await stubSpeech(page);
  await openCard(page);

  // Card examples (voices load late: the speakers show once they do).
  const speaker = speakers(page).first();
  await expect(speaker).toBeVisible();
  const text = (await speaker.getAttribute("aria-label"))!.slice("Escuchar: ".length);
  await speaker.click();
  await expect.poll(async () => (await spoken(page)).at(-1)?.text).toBe(text);
  // The local American English voice, never the network one nor the Spanish one.
  expect((await spoken(page)).at(-1)).toMatchObject({
    voiceName: "Test English",
    lang: "en-US",
    rate: 1,
  });
  // A second tap says it again at the learner's speed (no hidden toggle to the other speed).
  await speaker.click();
  await expect.poll(async () => (await spoken(page)).length).toBe(2);
  expect((await spoken(page)).map((u) => u.rate)).toEqual([1, 1]);

  // The word lookup card says its headword.
  const weekend = page.getByRole("button", { name: "weekend, ver traducción" }).first();
  await weekend.scrollIntoViewIfNeeded();
  await weekend.click();
  const dialog = page.getByRole("dialog", { name: "Traducción de weekend" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Escuchar: weekend", exact: true }).click();
  await expect.poll(async () => (await spoken(page)).at(-1)?.text).toBe("weekend");
  expect(problems).toEqual([]);
});

test("the Pronunciación switch hides every speaker, and is remembered", async ({ page }) => {
  const problems = collectProblems(page);
  await stubSpeech(page);
  await openCard(page);
  await expect(speakers(page).first()).toBeVisible();

  await page.getByRole("button", { name: "Pronunciación", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Pronunciación", exact: true });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.getByRole("button", { name: "Listo", exact: true }).click();
  await expect(speakers(page)).toHaveCount(0);

  await page.evaluate(() =>
    (
      window as unknown as { __e2e: { settingsWritesSettled: () => Promise<void> } }
    ).__e2e.settingsWritesSettled(),
  );
  // Card ids contain dots (the static server treats them as files): come back through home.
  await openCard(page);
  await expect(page.getByRole("button", { name: "Pronunciación", exact: true })).toBeVisible();
  await expect(speakers(page)).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("without an English voice on the device nothing about pronunciation shows", async ({
  page,
}) => {
  const problems = collectProblems(page);
  await stubSpeech(page, [{ name: "Test Español", lang: "es-ES" }]);
  await openCard(page);
  // Give the late voices time to arrive.
  await page.waitForTimeout(300);
  await expect(speakers(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pronunciación", exact: true })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("a review can include a sentence to hear, answered like any exercise", async ({ page }) => {
  const problems = collectProblems(page);
  await stubSpeech(page);
  await page.goto(`/?today=${DAY_1}`);
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();
  await playSessionCorrectly(page, "¡Lección completada!");
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  // Back home with the lesson saved before the days pass.
  await expect(page.getByText("Nada para repasar hoy")).toBeVisible();
  await expect(page.getByText("Perfecta · 6/6")).toBeVisible();

  await page.goto(`/?today=${DAY_3}`);
  const pending = page.getByText(/^\d+ pendientes?$/);
  await expect(pending).toBeVisible();
  const pendingCount = Number((await pending.textContent())?.match(/\d+/)?.[0]);
  await page.getByRole("button", { name: "Repasar", exact: true }).click();

  let answered = 0;
  let heard = 0;
  const exercise = page.locator('[data-testid^="exercise-"]').first();
  while (!(await page.getByText("¡Repaso completado!").isVisible())) {
    await expect(exercise).toBeVisible();
    const id = await currentExerciseId(page);
    if (isListeningExercise(id)) {
      heard += 1;
      await expect(page.getByText(/^Escucha y (escribe|elige)$/)).toBeVisible();
      const before = (await spoken(page)).length;
      await page.getByRole("button", { name: "Escuchar la frase", exact: true }).click();
      await expect.poll(async () => (await spoken(page)).length).toBe(before + 1);
      // "Más lento" is clearly slower than "Escuchar", every time it is tapped.
      await page.getByRole("button", { name: "Escuchar más lento", exact: true }).click();
      await expect.poll(async () => (await spoken(page)).length).toBe(before + 2);
      await page.getByRole("button", { name: "Escuchar más lento", exact: true }).click();
      await expect.poll(async () => (await spoken(page)).length).toBe(before + 3);
      const [normal, slower, again] = (await spoken(page)).slice(before);
      expect(normal).toMatchObject({ text: listeningSentence(id), rate: 1 });
      expect(slower).toMatchObject({ text: listeningSentence(id), rate: 0.7 });
      expect(again?.rate).toBe(0.7);
    }
    await answerCorrectly(page, "Comprobar");
    await expect(page.getByRole("alert")).toHaveText("Correcto");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    answered += 1;
    await expect(page.getByText("¡Repaso completado!").or(exercise)).toBeVisible();
  }

  expect(heard).toBeGreaterThanOrEqual(1);
  expect(heard).toBeLessThanOrEqual(2);
  // Listening stands in for exercises: home counted exactly what the review served.
  expect(answered).toBe(pendingCount);
  await expect(page.getByText(`XP ganada: ${answered * 10}`)).toBeVisible();
  expect(problems).toEqual([]);
});
