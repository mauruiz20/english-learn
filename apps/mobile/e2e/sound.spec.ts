import { expect, test, waitForServiceWorker, type ConsoleMessage } from "./support/test";

test("muting sounds is remembered after a reload and shows in the lesson header", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await expect(page.getByLabel("Racha: 0 días")).toBeVisible();
  await waitForServiceWorker(page);
  await page.getByRole("button", { name: "Silenciar sonidos", exact: true }).click();
  await expect(page.getByRole("button", { name: "Activar sonidos", exact: true })).toBeVisible();

  // The switch flips at once and saves in the background (a few ms): wait for the save to commit
  // before reloading, or the reload can stop it midway (test-only hook, EXPO_PUBLIC_E2E=1).
  await page.evaluate(() =>
    (
      window as unknown as { __e2e: { settingsWritesSettled: () => Promise<void> } }
    ).__e2e.settingsWritesSettled(),
  );
  await page.reload();
  await expect(page.getByLabel("Racha: 0 días")).toBeVisible();
  await expect(page.getByRole("button", { name: "Activar sonidos", exact: true })).toBeVisible();

  // The same switch sits in the exercise screens' header.
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();
  await expect(page.getByText("Ejercicio 1 de 6")).toBeVisible();
  await page.getByRole("button", { name: "Activar sonidos", exact: true }).click();
  await expect(page.getByRole("button", { name: "Silenciar sonidos", exact: true })).toBeVisible();

  // Sounds on again: choosing an option plays the bundled tap without errors.
  await page.getByRole("radio", { name: "despertarse", exact: true }).click();
  await page.getByRole("button", { name: "Comprobar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Correcto");

  // Lesson ids contain dots, which the static test server treats as files: reload from home.
  await page.goto("/");
  await expect(page.getByLabel("Racha: 0 días")).toBeVisible();
  await expect(page.getByRole("button", { name: "Silenciar sonidos", exact: true })).toBeVisible();
  expect(problems).toEqual([]);
});
