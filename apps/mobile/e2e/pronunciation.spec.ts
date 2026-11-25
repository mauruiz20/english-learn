import { expect, test, type ConsoleMessage, type Page } from "./support/test";
import { spoken, stubSpeech } from "./support/speech-stub";

// `?today=` is a test-only clock override, compiled in only with EXPO_PUBLIC_E2E=1.
const DAY_1 = "2030-01-01";
const CARD = "Look forward to + -ing";

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

/** Waits for background settings writes to commit (test-only hook, EXPO_PUBLIC_E2E=1). */
async function settingsSettled(page: Page) {
  await page.evaluate(() =>
    (
      window as unknown as { __e2e: { settingsWritesSettled: () => Promise<void> } }
    ).__e2e.settingsWritesSettled(),
  );
}

async function openCard(page: Page) {
  await page.goto(`/?today=${DAY_1}`);
  await page.getByRole("button", { name: /^Fichas: \d+ fichas, 0 estudiadas$/ }).click();
  await page.getByRole("button", { name: `${CARD}, B1`, exact: true }).click();
  await expect(page.getByRole("heading", { name: CARD, exact: true })).toBeVisible();
}

const speakers = (page: Page) => page.getByRole("button", { name: /^Escuchar: / });

test("a speaker says its English with an English voice, at the same speed every tap @chromium", async ({
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

test("the voice picked under Voz is used, tried with Probar, and remembered, and the Pronunciación switch hides every speaker @chromium", async ({
  page,
}) => {
  const problems = collectProblems(page);
  await stubSpeech(page);
  await openCard(page);
  await expect(speakers(page).first()).toBeVisible();

  await page.getByRole("button", { name: "Pronunciación", exact: true }).click();
  const automatic = page.getByRole("radio", { name: "Automática (Test English)", exact: true });
  await expect(automatic).toBeChecked();
  // Only local English voices are offered.
  await expect(page.getByRole("radio", { name: /Test Español|network/u })).toHaveCount(0);

  await page.getByRole("button", { name: "Probar la voz Test English UK", exact: true }).click();
  await expect.poll(async () => (await spoken(page)).at(-1)?.voiceName).toBe("Test English UK");
  await expect(automatic).toBeChecked();

  const uk = page.getByRole("radio", { name: "Test English UK, Reino Unido", exact: true });
  await uk.click();
  await expect(uk).toBeChecked();
  await page.getByRole("button", { name: "Listo", exact: true }).click();

  const before = (await spoken(page)).length;
  await speakers(page).first().click();
  await expect.poll(async () => (await spoken(page)).length).toBe(before + 1);
  expect((await spoken(page)).at(-1)).toMatchObject({
    voiceName: "Test English UK",
    lang: "en-GB",
  });

  await settingsSettled(page);
  await openCard(page);
  await expect(speakers(page).first()).toBeVisible();
  const count = (await spoken(page)).length;
  await speakers(page).first().click();
  await expect.poll(async () => (await spoken(page)).length).toBe(count + 1);
  expect((await spoken(page)).at(-1)?.voiceName).toBe("Test English UK");

  // The Pronunciación switch hides every speaker, and is remembered.
  await page.getByRole("button", { name: "Pronunciación", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Pronunciación", exact: true });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.getByRole("button", { name: "Listo", exact: true }).click();
  await expect(speakers(page)).toHaveCount(0);

  await settingsSettled(page);
  // Card ids contain dots (the static server treats them as files): come back through home.
  await openCard(page);
  await expect(page.getByRole("button", { name: "Pronunciación", exact: true })).toBeVisible();
  await expect(speakers(page)).toHaveCount(0);
  expect(problems).toEqual([]);
});
