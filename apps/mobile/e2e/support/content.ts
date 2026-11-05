// Reads the content data straight from packages/content/data (all files, so new content needs no
// change here) to answer whatever exercise the app shows. Test-only.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import { expandAccepted } from "../../../../packages/domain/src/answer-matching/pattern";

type Choice = { options: string[]; answerIndex: number };
type ExerciseData =
  | ({ type: "vocab" | "translation_choice" } & Choice)
  | { type: "cloze"; answers: string[]; distractors: string[] }
  | { type: "word_order"; accepted: string[] }
  | { type: "translate_write"; accepted: string[] }
  | { type: "reading"; questions: ({ prompt: string } & Choice)[] };

type ContentFile = {
  exercises?: ({ id: string; itemIds?: string[] } & ExerciseData)[];
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

/** The first `n` item ids (sorted) that some non-reading exercise practices: reviewable items. */
export function reviewableItemIds(n: number): string[] {
  const ids = new Set<string>();
  for (const path of jsonFiles(DATA_DIR)) {
    const file = JSON.parse(readFileSync(path, "utf8")) as ContentFile;
    for (const exercise of file.exercises ?? []) {
      if (exercise.type === "reading") continue;
      for (const id of exercise.itemIds ?? []) ids.add(id);
    }
  }
  const sorted = [...ids].sort();
  if (sorted.length < n) throw new Error(`Only ${sorted.length} reviewable items`);
  return sorted.slice(0, n);
}

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
      // `accepted` holds answer patterns: type the reference sentence they stand for.
      await scope
        .getByLabel("Tu traducción en inglés")
        .fill(expandAccepted(exercise.accepted)[0] ?? "");
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

const LEVELS = ["a1", "a2", "b1", "b2", "c1"] as const;

/**
 * Answers the placement question on screen as a learner at `level` would: right up to that
 * level (from its `placement.<level>.` id), wrong above it, then presses "Siguiente".
 */
export async function answerPlacementAs(
  page: Page,
  level: (typeof LEVELS)[number],
): Promise<string> {
  const id = await currentExerciseId(page);
  const questionLevel = /^placement\.([a-c][12])\./.exec(id)?.[1] ?? "";
  if (LEVELS.indexOf(questionLevel as (typeof LEVELS)[number]) <= LEVELS.indexOf(level)) {
    return answerCorrectly(page, "Siguiente");
  }
  const exercise = exercisesById.get(id);
  if (exercise === undefined) throw new Error(`Unknown exercise "${id}"`);
  const scope = page.getByTestId(`exercise-${id}`);
  const wrong =
    exercise.type === "vocab" || exercise.type === "translation_choice"
      ? exercise.options.find((_, i) => i !== exercise.answerIndex)
      : exercise.type === "cloze"
        ? exercise.distractors[0]
        : undefined;
  if (wrong === undefined) throw new Error(`No wrong option for "${id}"`);
  await scope.getByRole("radio", { name: wrong, exact: true }).click();
  await scope.getByRole("button", { name: "Siguiente", exact: true }).click();
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
