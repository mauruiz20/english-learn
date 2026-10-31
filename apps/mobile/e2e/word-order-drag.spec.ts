import type { Locator } from "@playwright/test";
import { expect, test, type Page } from "./support/test";

async function checkAndContinue(page: Page) {
  await page.getByRole("button", { name: "Comprobar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Correcto");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
}

/** The strip's box once it stopped moving (a dropped strip springs into place). */
async function settledBox(strip: Locator) {
  let previous = await strip.boundingBox();
  for (let i = 0; i < 40; i++) {
    await strip.page().waitForTimeout(50);
    const box = await strip.boundingBox();
    if (box !== null && previous !== null && box.x === previous.x && box.y === previous.y) {
      return box;
    }
    previous = box;
  }
  return previous;
}

/** Drags `strip` with the mouse and releases it at `to` (page coordinates), in small steps. */
async function drag(page: Page, strip: Locator, to: { x: number; y: number }) {
  const box = await settledBox(strip);
  if (box === null) throw new Error("The strip is not on screen");
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y + 4, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

const line = (page: Page) => page.getByLabel("Tu frase");
const bank = (page: Page) => page.getByLabel("Palabras disponibles");

/** Drags a word from the bank to the end of the answer line. */
async function dragToLineEnd(page: Page, word: string) {
  // Measured once still: the page slides in when it turns to the exercise.
  const box = await settledBox(line(page));
  if (box === null) throw new Error("The answer line is not on screen");
  await drag(page, bank(page).getByRole("button", { name: word, exact: true }), {
    x: box.x + box.width - 8,
    y: box.y + box.height - 24,
  });
  await expect(
    line(page).getByRole("button", { name: `Quitar ${word}`, exact: true }),
  ).toBeVisible();
}

/** The words on the answer line, in order. */
async function sentence(page: Page) {
  const names = await line(page)
    .getByRole("button")
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label") ?? ""));
  return names.map((name) => name.replace(/^Quitar /, ""));
}

test("builds the word-order sentence by dragging paper strips, and reorders it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();
  await page.getByRole("radio", { name: "despertarse", exact: true }).click();
  await checkAndContinue(page);
  await page.getByRole("radio", { name: "have", exact: true }).click();
  await checkAndContinue(page);

  // Out of order on purpose: "usually" first.
  await dragToLineEnd(page, "usually");
  await dragToLineEnd(page, "I");
  expect(await sentence(page)).toEqual(["usually", "I"]);

  // Drag "I" onto the left half of "usually": it moves in front of it.
  const usually = await settledBox(line(page).getByRole("button", { name: "Quitar usually" }));
  if (usually === null) throw new Error("usually is not on the line");
  await drag(page, line(page).getByRole("button", { name: "Quitar I" }), {
    x: usually.x + 4,
    y: usually.y + usually.height / 2,
  });
  await expect.poll(() => sentence(page)).toEqual(["I", "usually"]);

  for (const word of ["wake", "up", "at"]) await dragToLineEnd(page, word);
  // Tapping still works alongside dragging.
  await bank(page).getByRole("button", { name: "six.", exact: true }).click();
  expect(await sentence(page)).toEqual(["I", "usually", "wake", "up", "at", "six."]);

  await checkAndContinue(page);
  await expect(page.getByText("Ejercicio 4 de 6")).toBeVisible();
});

test("a strip dragged off the answer line goes back to the bank", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();
  await page.getByRole("radio", { name: "despertarse", exact: true }).click();
  await checkAndContinue(page);
  await page.getByRole("radio", { name: "have", exact: true }).click();
  await checkAndContinue(page);

  await dragToLineEnd(page, "wake");
  const bankBox = await bank(page).boundingBox();
  if (bankBox === null) throw new Error("The bank is not on screen");
  // Released below the bank, over the (disabled) "Comprobar" button.
  await drag(page, line(page).getByRole("button", { name: "Quitar wake" }), {
    x: bankBox.x + bankBox.width / 2,
    y: bankBox.y + bankBox.height + 40,
  });

  await expect(bank(page).getByRole("button", { name: "wake", exact: true })).toBeVisible();
  expect(await sentence(page)).toEqual([]);
});
