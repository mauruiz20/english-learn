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
  lessons?: { id: string; level: string; title: string }[];
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

/**
 * The path's lessons (practice lessons excluded) in path order: like the generated corpus, files
 * sorted by path, lessons in file order.
 */
const pathLessons = jsonFiles(DATA_DIR)
  .filter((path) => !path.includes(`${DATA_DIR}/practice/`))
  .sort()
  .flatMap((path) => (JSON.parse(readFileSync(path, "utf8")) as ContentFile).lessons ?? []);

/** The lessons of a level, in path order. */
export function lessonsOfLevel(level: string): { id: string; title: string }[] {
  return pathLessons.filter((lesson) => lesson.level === level);
}

/** The levels with lessons, in CEFR order (what the path's level picker lists). */
export function levelsWithLessons(): string[] {
  return ["A1", "A2", "B1", "B2", "C1"].filter((level) => lessonsOfLevel(level).length > 0);
}

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

/** A listening exercise's id: its source exercise's id and this suffix (made by the app). */
const LISTEN_SUFFIX = "~listen";

export const isListeningExercise = (id: string) => id.endsWith(LISTEN_SUFFIX);

/**
 * The sentence a listening exercise says: its source's word_order sentence or translate_write
 * reference answer (the app's `listenSource`).
 */
export function listeningSentence(id: string): string {
  const source = exercisesById.get(id.slice(0, -LISTEN_SUFFIX.length));
  if (source?.type === "word_order") return source.accepted[0] ?? "";
  if (source?.type === "translate_write") return expandAccepted(source.accepted)[0] ?? "";
  throw new Error(`No sentence to hear for "${id}"`);
}

/** Answers the exercise on screen correctly and presses `submit` ("Comprobar" or "Siguiente"). */
export async function answerCorrectly(page: Page, submit: string): Promise<string> {
  const id = await currentExerciseId(page);
  const scope = page.getByTestId(`exercise-${id}`);
  const choose = (option: string) =>
    scope.getByRole("radio", { name: option, exact: true }).click();
  // Heard instead of read (reviews, when the browser can speak English): write or pick it.
  if (isListeningExercise(id)) {
    const sentence = listeningSentence(id);
    const input = scope.getByLabel("Lo que escuchaste, en inglés");
    if (await input.isVisible()) await input.fill(sentence);
    else await choose(sentence);
    await scope.getByRole("button", { name: submit, exact: true }).click();
    return id;
  }
  const exercise = exercisesById.get(id);
  if (exercise === undefined) throw new Error(`Unknown exercise "${id}"`);

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

/** Answers the (non-reading) exercise on screen wrongly and presses `submit`. */
export async function answerWrongly(page: Page, submit: string): Promise<string> {
  const id = await currentExerciseId(page);
  const scope = page.getByTestId(`exercise-${id}`);
  const choose = (option: string) =>
    scope.getByRole("radio", { name: option, exact: true }).click();
  const write = (label: string) => scope.getByLabel(label).fill("zzz qqq");
  if (isListeningExercise(id)) {
    const input = scope.getByLabel("Lo que escuchaste, en inglés");
    if (await input.isVisible()) await input.fill("zzz qqq");
    else {
      const sentence = listeningSentence(id);
      const options = await scope.getByRole("radio").allTextContents();
      await choose(options.find((o) => o.trim() !== sentence) ?? "");
    }
    await scope.getByRole("button", { name: submit, exact: true }).click();
    return id;
  }
  const exercise = exercisesById.get(id);
  if (exercise === undefined) throw new Error(`Unknown exercise "${id}"`);
  switch (exercise.type) {
    case "vocab":
    case "translation_choice":
      await choose(exercise.options.find((_, i) => i !== exercise.answerIndex) ?? "");
      break;
    case "cloze":
      await choose(exercise.distractors[0] ?? "");
      break;
    case "word_order":
      // The words in reverse order: never an accepted sentence.
      for (const token of (exercise.accepted[0] ?? "").split(" ").reverse()) {
        await scope
          .getByLabel("Palabras disponibles")
          .getByRole("button", { name: token, exact: true })
          .first()
          .click();
      }
      break;
    case "translate_write":
      await write("Tu traducción en inglés");
      break;
    case "reading":
      throw new Error(`Reading "${id}" is never reviewed`);
  }
  await scope.getByRole("button", { name: submit, exact: true }).click();
  return id;
}

const LEVELS = ["a1", "a2", "b1", "b2", "c1"] as const;

/**
 * Answers the placement question on screen as a learner at `level` would: right up to that
 * level (from its `placement.<level>.` id), wrong above it, then presses "Siguiente". A true
 * beginner (`"beginner"`) answers everything wrong, which the test places at A1.
 */
export async function answerPlacementAs(
  page: Page,
  level: (typeof LEVELS)[number] | "beginner",
): Promise<string> {
  const id = await currentExerciseId(page);
  const questionLevel = /^placement\.([a-c][12])\./.exec(id)?.[1] ?? "";
  const known = level === "beginner" ? -1 : LEVELS.indexOf(level);
  if (LEVELS.indexOf(questionLevel as (typeof LEVELS)[number]) <= known) {
    return answerCorrectly(page, "Siguiente");
  }
  return answerPlacementWrongly(page, id);
}

/**
 * A placement taker the test estimates exactly at `level`: right below it, every other
 * question of `level` right (starting with the first), wrong above it. (Right on every question
 * up to B2 estimates C1; this pattern estimates B2 every time, checked against the CAT.)
 */
export function placementTakerAt(level: (typeof LEVELS)[number]): (page: Page) => Promise<string> {
  let atLevel = 0;
  return async (page) => {
    const id = await currentExerciseId(page);
    const questionLevel = /^placement\.([a-c][12])\./.exec(id)?.[1] ?? "";
    const rank = LEVELS.indexOf(questionLevel as (typeof LEVELS)[number]);
    const target = LEVELS.indexOf(level);
    const right = rank < target || (rank === target && atLevel++ % 2 === 0);
    return right ? answerCorrectly(page, "Siguiente") : answerPlacementWrongly(page, id);
  };
}

/** Picks a wrong option of the placement question `id` on screen and presses "Siguiente". */
async function answerPlacementWrongly(page: Page, id: string): Promise<string> {
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
