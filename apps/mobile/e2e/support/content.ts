// Reads the content data straight from packages/content/data (all files, so new content needs no
// change here) to answer whatever exercise the app shows. Test-only.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

type Choice = { options: string[]; answerIndex: number };
type ExerciseData =
  | ({ type: "vocab" | "translation_choice" } & Choice)
  | { type: "cloze"; answers: string[] }
  | { type: "word_order"; accepted: string[] }
  | { type: "translate_write"; accepted: string[] }
  | { type: "reading"; questions: ({ prompt: string } & Choice)[] };

type ContentFile = {
  exercises?: ({ id: string } & ExerciseData)[];
  placement?: { id: string; exercise: ExerciseData }[];
};

const DATA_DIR = resolve(__dirname, "../../../../packages/content/data");

function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return jsonFiles(path);
    return name.endsWith(".json") ? [path] : [];
  });
}

/** Every exercise and placement question, by the id the app tags it with (`exercise-<id>`). */
const exercisesById: ReadonlyMap<string, ExerciseData> = new Map(
  jsonFiles(DATA_DIR).flatMap((path) => {
    const file = JSON.parse(readFileSync(path, "utf8")) as ContentFile;
    return [
      ...(file.exercises ?? []).map((e) => [e.id, e] as const),
      ...(file.placement ?? []).map((q) => [q.id, q.exercise] as const),
    ];
  }),
);

const EXERCISE = '[data-testid^="exercise-"]';

/** Id of the exercise on screen. */
export async function currentExerciseId(page: Page): Promise<string> {
  const testId = await page.locator(EXERCISE).first().getAttribute("data-testid");
  if (testId === null) throw new Error("No exercise on screen");
  return testId.slice("exercise-".length);
}

/** Answers the exercise on screen correctly and presses `submit` ("Comprobar" or "Siguiente"). */
export async function answerCorrectly(page: Page, submit: string): Promise<string> {
  const id = await currentExerciseId(page);
  const exercise = exercisesById.get(id);
  if (exercise === undefined) throw new Error(`Unknown exercise "${id}"`);
  const scope = page.getByTestId(`exercise-${id}`);
  const choose = (option: string) =>
    scope.getByRole("radio", { name: option, exact: true }).click();

  switch (exercise.type) {
    case "vocab":
    case "translation_choice":
      await choose(exercise.options[exercise.answerIndex] ?? "");
      break;
    case "cloze":
      await choose(exercise.answers[0] ?? "");
      break;
    case "word_order":
      // A tapped token leaves the pool, so `.first()` also handles repeated words.
      for (const token of (exercise.accepted[0] ?? "").split(" ")) {
        await scope
          .getByLabel("Palabras disponibles")
          .getByRole("button", { name: token, exact: true })
          .first()
          .click();
      }
      break;
    case "translate_write":
      await scope.getByLabel("Tu traducción en inglés").fill(exercise.accepted[0] ?? "");
      break;
    case "reading":
      for (const question of exercise.questions) {
        await scope
          .getByRole("radiogroup", { name: question.prompt, exact: true })
          .getByRole("radio", { name: question.options[question.answerIndex] ?? "", exact: true })
          .click();
      }
      break;
  }
  await scope.getByRole("button", { name: submit, exact: true }).click();
  return id;
}

/** Answers every exercise of a lesson or review correctly, continuing after each feedback. */
export async function playSessionCorrectly(page: Page, finishedText: string): Promise<number> {
  let answered = 0;
  while (!(await page.getByText(finishedText).isVisible())) {
    await expect(page.locator(EXERCISE).first()).toBeVisible();
    await answerCorrectly(page, "Comprobar");
    await expect(page.getByRole("alert")).toHaveText("Correcto");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    answered += 1;
    await expect(page.getByText(finishedText).or(page.locator(EXERCISE).first())).toBeVisible();
  }
  return answered;
}
