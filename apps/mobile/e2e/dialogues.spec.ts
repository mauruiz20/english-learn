import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type ConsoleMessage, type Page } from "./support/test";
import { spoken, stubSpeech } from "./support/speech-stub";
import { expandAccepted } from "../../../packages/domain/src/answer-matching/pattern";

// `?today=` is a test-only clock override, compiled in only with EXPO_PUBLIC_E2E=1.
const DAY_1 = "2030-01-01";

type Option = { en: string; rating: "good" | "ok" | "wrong" };
type Node =
  | { id: string; kind: "npc"; en: string }
  | { id: string; kind: "choose"; options: Option[] }
  | { id: string; kind: "write"; prompt: string; accepted: string[] }
  | { id: string; kind: "end"; text: string };
type Dialogue = { id: string; title: string; nodes: Node[] };

const AIRPORT: Dialogue = (
  JSON.parse(
    readFileSync(
      resolve(__dirname, "../../../packages/content/data/practice/dialogues/airport-check-in.json"),
      "utf8",
    ),
  ) as { dialogues: Dialogue[] }
).dialogues[0]!;

const node = <K extends Node["kind"]>(id: string, kind: K) => {
  const found = AIRPORT.nodes.find((n) => n.id === id);
  if (found?.kind !== kind) throw new Error(`no ${kind} node ${id}`);
  return found as Extract<Node, { kind: K }>;
};
const chooseTurns = AIRPORT.nodes.filter(
  (n): n is Extract<Node, { kind: "choose" }> => n.kind === "choose",
);
const writeTurns = AIRPORT.nodes.filter(
  (n): n is Extract<Node, { kind: "write" }> => n.kind === "write",
);
const TURNS = chooseTurns.length + writeTurns.length;

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

const reply = (page: Page, en: string) =>
  page.getByRole("button", { name: `Responder: ${en}`, exact: true });

/** From home to the airport dialogue's intro, through Práctica libre → Diálogos. */
async function openAirportDialogue(page: Page, status: string) {
  await page.goto(`/?today=${DAY_1}`);
  await page.getByRole("button", { name: /^Práctica libre: .*Diálogos.*, a tu ritmo$/ }).click();
  await expect(page.getByRole("heading", { name: "Práctica libre", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Diálogos: 3 grupos, 10 diálogos/ }).click();
  await expect(page.getByRole("heading", { name: "Diálogos", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fuera de casa, nivel A2" })).toBeVisible();
  await page.getByRole("button", { name: `${AIRPORT.title}, ${status}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: AIRPORT.title, exact: true })).toBeVisible();
}

/** Replies to every turn with its good reply (or model answer) up to the summary. */
async function playAllGood(page: Page) {
  const done = page.getByRole("heading", { name: "¡Diálogo completado!" });
  for (let answered = 0; answered < TURNS; answered += 1) {
    const input = page.getByLabel("Tu respuesta en inglés");
    // Wait for the reply area of the next turn (choose or write).
    await expect(
      page
        .getByText("Elige tu respuesta", { exact: true })
        .or(page.getByText("Escribe tu respuesta en inglés", { exact: true })),
    ).toBeVisible();
    let turn: Node | undefined;
    for (const t of chooseTurns) {
      if (await reply(page, t.options[0]!.en).isVisible()) turn = t;
    }
    if (turn?.kind === "choose") {
      await reply(page, turn.options.find((o) => o.rating === "good")!.en).click();
    } else {
      await expect(input).toBeVisible();
      for (const t of writeTurns) {
        if (await page.getByText(t.prompt, { exact: true }).isVisible()) turn = t;
      }
      if (turn?.kind !== "write") throw new Error("no turn on screen");
      await input.fill(expandAccepted(turn.accepted)[0]!);
      await page.getByRole("button", { name: "Responder", exact: true }).click();
    }
    await expect(page.getByRole("alert").filter({ hasText: "¡Bien dicho!" })).toBeVisible();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
  }
  await expect(done).toBeVisible();
}

test("dialogues: an all-good path ends perfect, and a wrong reply changes the reaction", async ({
  page,
}) => {
  const problems = collectProblems(page);
  await openAirportDialogue(page, "nuevo");
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  const greeting = node("greet", "npc").en;
  await expect(page.getByText(greeting, { exact: true })).toBeVisible();

  await playAllGood(page);
  const perfect = `${TURNS}/${TURNS}`;
  await expect(page.getByText(`Perfecto · ${perfect}`)).toBeVisible();
  await expect(page.getByText(`Respuestas buenas: ${TURNS} de ${TURNS}`)).toBeVisible();
  await expect(page.getByText(node("end", "end").text)).toBeVisible();
  await expect(page.getByText("Lo nuevo de hoy")).toBeVisible();

  // Replay, taking the wrong reply on the first turn: its feedback, then another reaction.
  await page.getByRole("button", { name: "Repetir diálogo", exact: true }).click();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  const first = node("destination", "choose");
  const wrong = first.options.find((o) => o.rating === "wrong")!;
  const good = first.options.find((o) => o.rating === "good")!;
  await reply(page, wrong.en).click();
  const band = page.getByRole("alert").filter({ hasText: "No del todo" });
  await expect(band).toBeVisible();
  await expect(band).toContainText("Malentendido: no te preguntó cómo estás");
  await expect(band).toContainText(`Mejor: ${good.en}`);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText(node("passport-again", "npc").en, { exact: true })).toBeVisible();
  await expect(page.getByText(node("passport", "npc").en, { exact: true })).toHaveCount(0);

  // Back on the collection, the best result stays perfect.
  await page.goto(`/practica/dialogues?today=${DAY_1}`);
  const row = page.getByRole("button", {
    name: `${AIRPORT.title}, completado sin errores: ${TURNS} de ${TURNS} respuestas buenas`,
    exact: true,
  });
  await expect(row).toBeVisible();
  await expect(row.getByText(`Perfecto · ${perfect}`)).toBeVisible();
  expect(problems).toEqual([]);
});

test("dialogues: the speaker on a character's line says it", async ({ page }) => {
  const problems = collectProblems(page);
  await stubSpeech(page);
  await openAirportDialogue(page, "nuevo");
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  const greeting = node("greet", "npc").en;
  const speaker = page.getByRole("button", { name: `Escuchar: ${greeting}`, exact: true });
  await expect(speaker).toBeVisible();
  // Nothing is said before the learner taps a speaker (read-aloud is off).
  expect(await spoken(page)).toEqual([]);
  await speaker.click();
  await expect.poll(async () => (await spoken(page)).at(-1)?.text).toBe(greeting);
  expect((await spoken(page)).at(-1)).toMatchObject({ voiceName: "Test English", lang: "en-US" });
  expect(problems).toEqual([]);
});
