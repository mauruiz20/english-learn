import { answerCorrectly } from "./support/content";
import { expect, test, type ConsoleMessage, type Page } from "./support/test";

/** The words of the marked answer that carry the red-pen strike. */
function struckWords(page: Page): Promise<string[]> {
  return page.getByTestId("struck-answer").evaluate((root) =>
    Array.from(root.querySelectorAll("*"))
      .filter(
        (node) =>
          node.childElementCount === 0 &&
          getComputedStyle(node).textDecorationLine.includes("line-through"),
      )
      .map((node) => node.textContent?.trim() ?? ""),
  );
}

test("free writing: an extra article is 'almost', with only that word struck and a hint", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();

  // Every exercise before the translation, answered right.
  const writing = page.getByLabel("Tu traducción en inglés");
  for (let i = 0; i < 10 && !(await writing.isVisible()); i++) {
    await answerCorrectly(page, "Comprobar");
    await expect(page.getByRole("alert")).toHaveText("Correcto");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page.getByText(/^Ejercicio \d+ de \d+$/)).toBeVisible();
  }

  // "Normalmente me voy a la cama a las once.": "to the bed" is a calque of "a la cama".
  await writing.fill("I usually go to the bed at eleven");
  await page.getByRole("button", { name: "Comprobar", exact: true }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Casi. Sobra la palabra 'the'. Respuesta correcta: I usually go to bed at eleven.",
  );
  await expect(page.getByText("¡Casi!")).toBeVisible();
  await expect(page.getByText("En inglés se dice 'to bed', sin 'the'.")).toBeVisible();
  await expect(page.getByText("Casi. Fíjate: I usually go to bed at eleven.")).toBeVisible();
  await expect.poll(() => struckWords(page)).toEqual(["the"]);
  await expect(
    page.getByRole("button", { name: "Mi respuesta también es correcta", exact: true }),
  ).toBeVisible();

  expect(problems).toEqual([]);
});
