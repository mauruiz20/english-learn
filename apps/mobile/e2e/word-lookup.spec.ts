import { answerCorrectly } from "./support/content";
import { expect, test, type ConsoleMessage, type Page } from "./support/test";

const lookup = (page: Page, word: string) =>
  page.getByRole("button", { name: `${word}, ver traducción`, exact: true });

async function openRoutineLesson(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();
  await expect(page.getByText("Ejercicio 1 de 6")).toBeVisible();
}

test("the vocab term is not interactive until the answer is checked", async ({ page }) => {
  await openRoutineLesson(page);

  // "What does 'wake up' mean?": the evaluated term is locked, the rest of the prompt is not.
  await expect(page.getByText("What does 'wake up' mean?")).toBeVisible();
  await expect(lookup(page, "wake up")).toHaveCount(0);
  await expect(lookup(page, "mean")).toBeVisible();

  await page.getByRole("radio", { name: "despertarse", exact: true }).click();
  await page.getByRole("button", { name: "Comprobar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Correcto");

  await lookup(page, "wake up").click();
  await expect(page.getByRole("dialog", { name: "Traducción de wake up" })).toContainText(
    "despertarse",
  );
});

test("looks up words of a reading passage by hover and by click", async ({ page, browserName }) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await openRoutineLesson(page);
  // The first-time hint, once.
  await expect(
    page.getByText("Pasa el mouse o haz clic en una palabra para ver su traducción"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Entendido", exact: true }).click();
  await expect(page.getByText(/para ver su traducción/)).toHaveCount(0);

  // Answer the exercises before the reading one.
  for (let i = 0; i < 4; i++) {
    await answerCorrectly(page, "Comprobar");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
  }
  await expect(page.getByText("Ejercicio 5 de 6")).toBeVisible();
  const brother = lookup(page, "brother");
  await expect(brother).toBeVisible();

  if (browserName === "chromium") {
    // Hover (desktop pointer): a tooltip, no focus change.
    await brother.hover();
    await expect(page.getByRole("tooltip")).toContainText("hermano");
    await page.mouse.move(0, 0);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  }

  // Click: the card opens as a dialog that takes focus; Escape closes it and returns focus.
  await brother.click();
  const dialog = page.getByRole("dialog", { name: "Traducción de brother" });
  await expect(dialog).toContainText("hermano");
  await expect(dialog).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(brother).toBeFocused();

  // Keyboard: Enter on a focused word opens it; a click outside closes it.
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await page.getByText("Lee el texto y responde").click();
  await expect(dialog).toHaveCount(0);

  // Opening another word replaces the card.
  await brother.click();
  await lookup(page, "commute").first().click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toContainText("trayecto");

  expect(problems).toEqual([]);
});
