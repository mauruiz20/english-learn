import { expect, test, type ConsoleMessage, type Page } from "./support/test";

async function choose(page: Page, option: string) {
  await page.getByRole("radio", { name: option, exact: true }).click();
}

async function checkAndContinue(page: Page, verdict: string) {
  await page.getByRole("button", { name: "Comprobar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(verdict);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
}

test("completes the seed A2 lesson and keeps XP and streak after a reload", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await expect(page.getByLabel("Racha: 0 días")).toBeVisible();
  await expect(page.getByText("Lecciones de nivel A2")).toBeVisible();
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();

  await expect(page.getByText("Ejercicio 1 de 6")).toBeVisible();
  await choose(page, "despertarse");
  await checkAndContinue(page, "Correcto");

  await choose(page, "have");
  await checkAndContinue(page, "Correcto");

  // Word order: tap the tokens in the right order.
  for (const token of ["I", "usually", "wake", "up", "at", "six."]) {
    await page.getByRole("button", { name: token, exact: true }).click();
  }
  await checkAndContinue(page, "Correcto");

  await choose(page, "Ella se acuesta a las once.");
  await checkAndContinue(page, "Correcto");

  await choose(page, "At six thirty");
  await choose(page, "By bus");
  await checkAndContinue(page, "Correcto");

  // A typo is "almost": still progresses, with the correct answer shown.
  await page.getByLabel("Tu traducción en inglés").fill("I usualy go to bed at eleven");
  await page.getByRole("button", { name: "Comprobar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Casi. Respuesta correcta: I usually go to bed at eleven.",
  );
  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  // 5 correct × 10 + 5 (almost) + 20 bonus (5/6 ≥ 80 %).
  await expect(page.getByText("¡Lección completada!")).toBeVisible();
  await expect(page.getByText("Aciertos: 5 de 6")).toBeVisible();
  await expect(page.getByText("XP ganada: 75")).toBeVisible();
  await expect(page.getByText("Racha: 1 día")).toBeVisible();

  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await expect(page.getByLabel("Racha: 1 día")).toBeVisible();
  await expect(page.getByText("75 XP", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mi rutina diaria, completada" })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Racha: 1 día")).toBeVisible();
  await expect(page.getByText("75 XP", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mi rutina diaria, completada" })).toBeVisible();

  expect(problems).toEqual([]);
});
