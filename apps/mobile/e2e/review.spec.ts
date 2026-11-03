import { expect, test, type ConsoleMessage } from "./support/test";
import { playSessionCorrectly } from "./support/content";

// `?today=` is a test-only clock override, compiled in only with EXPO_PUBLIC_E2E=1.
const DAY_1 = "2030-01-01";
const DAY_3 = "2030-01-03";

test("review: items learned in a lesson come back days later and can be reviewed", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto(`/?today=${DAY_1}`);
  await expect(page.getByText("Nada para repasar hoy")).toBeVisible();
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();
  await playSessionCorrectly(page, "¡Lección completada!");
  // The summary's "XP ganada" counts up on screen; its accessible name holds the final value
  // from the start, so read that instead of the number mid-count.
  const lessonXp = Number(
    (await page.getByLabel(/^XP ganada: \d+$/).getAttribute("aria-label"))?.match(/\d+/)?.[0],
  );
  expect(lessonXp).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();

  // Same day: everything was just learned, nothing is due. Home is still mounted under the
  // lesson with the progress it loaded before it (0 XP, nothing to review), and reloads on focus:
  // wait for the new total instead of reading the XP once (on WebKit that read could land before
  // the reload and see 0).
  const xpAfterLesson = lessonXp;
  await expect(page.getByText(`${xpAfterLesson} XP`, { exact: true })).toBeVisible();
  await expect(page.getByText("Nada para repasar hoy")).toBeVisible();

  await page.goto(`/?today=${DAY_3}`);
  const pending = page.getByText(/^\d+ pendientes?$/);
  await expect(pending).toBeVisible();
  const pendingCount = Number((await pending.textContent())?.match(/\d+/)?.[0]);
  expect(pendingCount).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Repasar", exact: true }).click();
  const reviewed = await playSessionCorrectly(page, "¡Repaso completado!");
  expect(reviewed).toBeGreaterThan(0);
  expect(reviewed).toBeLessThanOrEqual(pendingCount);
  await expect(page.getByText(`XP ganada: ${reviewed * 10}`)).toBeVisible();
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();

  await expect(page.getByText("Nada para repasar hoy")).toBeVisible();
  await expect(
    page.getByText(`${xpAfterLesson + reviewed * 10} XP`, { exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByText(`${xpAfterLesson + reviewed * 10} XP`, { exact: true }),
  ).toBeVisible();
  expect(problems).toEqual([]);
});
