import { expect, test, type Page } from "./support/test";
import { spoken, stubSpeech } from "./support/speech-stub";

const TITLE = "Cambiar planes con un amigo";
const GREETING = "Hi! Are we still meeting for coffee at six on Saturday?";

async function openPilot(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: `Lección piloto B1: ${TITLE}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: TITLE, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await expect(page.getByText(GREETING, { exact: true })).toBeVisible();
}

test("B1 pilot connects choices, optional local audio and writing, works offline and keeps the result", async ({
  page,
  context,
}) => {
  await stubSpeech(page);
  await openPilot(page);
  await page.getByRole("button", { name: `Escuchar: ${GREETING}`, exact: true }).click();
  await expect.poll(async () => (await spoken(page)).at(-1)?.text).toBe(GREETING);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await context.setOffline(true);
  const turns = [
    { kind: "choose", text: "I'm looking forward to it, but something has come up." },
    { kind: "write", text: "Could we put it off until Sunday?" },
    { kind: "choose", text: "Could we meet in the morning?" },
    { kind: "choose", text: "Five sounds good. Where shall we meet?" },
    { kind: "write", text: "Let's meet outside the cafe at five on Sunday." },
    { kind: "choose", text: "Me too! See you on Sunday." },
  ];
  for (const turn of turns) {
    if (turn.kind === "write") {
      await page.getByLabel("Tu respuesta en inglés", { exact: true }).fill(turn.text);
      await page.getByRole("button", { name: "Responder", exact: true }).click();
    } else await page.getByRole("button", { name: `Responder: ${turn.text}`, exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "¡Bien dicho!" })).toBeVisible();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
  }
  await expect(
    page.getByRole("heading", { name: "¡Diálogo completado!", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Respuestas buenas: 6 de 6", { exact: true })).toBeVisible();
  await context.setOffline(false);
  await page.goto("/practica/dialogues");
  await expect(page.getByRole("button", { name: new RegExp(`^${TITLE},`) })).toContainText(
    "Perfecto · 6/6",
  );
  await page.reload();
  await expect(page.getByRole("button", { name: new RegExp(`^${TITLE},`) })).toContainText(
    "Perfecto · 6/6",
  );
});

test("the pilot remains playable as text when no device voice is available", async ({ page }) => {
  await stubSpeech(page, []);
  await openPilot(page);
  await expect(
    page.getByRole("button", { name: `Escuchar: ${GREETING}`, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Responder: I had coffee yesterday.", exact: true })
    .click();
  await expect(page.getByRole("alert").filter({ hasText: "No del todo" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page.getByText("I mean our plan for this Saturday. Do you need to change it?", { exact: true }),
  ).toBeVisible();
});
