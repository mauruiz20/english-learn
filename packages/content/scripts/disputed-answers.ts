/**
 * Owner tool (`pnpm --filter @english-learn/content disputed-answers [events.json]`).
 *
 * Reads a JSON export of progress events (an array, or an object with an `events` array) from
 * the given file or stdin, and lists the `answer_disputed` events ("Mi respuesta también es
 * correcta") grouped by exercise, most disputed first, with the Spanish prompt, the reference
 * answer and each distinct answer (case, spacing and final punctuation ignored) with its count.
 * Answers the current patterns already accept are marked "(now accepted)". No network.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { expandAccepted, matchPatternAnswer, normalizeAnswer } from "@english-learn/domain";
import type { TranslateWriteExercise } from "../src/schema";
import { load } from "./validate";

export interface Dispute {
  readonly exerciseId: string;
  readonly answer: string;
}

export interface DisputedAnswer {
  readonly answer: string;
  readonly count: number;
  /** The exercise's current answer patterns accept it (already fixed in the content). */
  readonly nowAccepted: boolean;
}

export interface DisputeGroup {
  readonly exerciseId: string;
  /** Spanish prompt, or null when the exercise is not (or no longer) in the content. */
  readonly es: string | null;
  readonly reference: string | null;
  readonly total: number;
  readonly answers: readonly DisputedAnswer[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function payloadOf(event: Record<string, unknown>): Record<string, unknown> | null {
  const { payload } = event;
  if (typeof payload === "string") {
    try {
      const parsed: unknown = JSON.parse(payload);
      return isObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isObject(payload) ? payload : null;
}

/** The disputes in an events export; anything else (other types, malformed events) is skipped. */
export function parseDisputes(input: unknown): Dispute[] {
  const events = Array.isArray(input) ? input : isObject(input) ? input.events : undefined;
  if (!Array.isArray(events)) throw new Error("expected an array of events (or { events: [...] })");
  return events.flatMap((event: unknown): Dispute[] => {
    if (!isObject(event) || event.type !== "answer_disputed") return [];
    const payload = payloadOf(event);
    if (payload === null) return [];
    const { exerciseId, answer } = payload;
    if (typeof exerciseId !== "string" || typeof answer !== "string") return [];
    return [{ exerciseId, answer }];
  });
}

export function disputedAnswers(
  disputes: readonly Dispute[],
  exercises: readonly TranslateWriteExercise[],
): DisputeGroup[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const groups = new Map<string, Map<string, { answer: string; count: number }>>();
  for (const { exerciseId, answer } of disputes) {
    const answers = groups.get(exerciseId) ?? new Map<string, { answer: string; count: number }>();
    groups.set(exerciseId, answers);
    const key = normalizeAnswer(answer);
    const seen = answers.get(key);
    answers.set(key, { answer: seen?.answer ?? answer, count: (seen?.count ?? 0) + 1 });
  }
  return [...groups]
    .map(([exerciseId, answers]): DisputeGroup => {
      const exercise = byId.get(exerciseId);
      const list = [...answers.values()]
        .map(({ answer, count }) => ({
          answer,
          count,
          nowAccepted:
            exercise !== undefined &&
            matchPatternAnswer(answer, exercise.accepted).verdict === "correct",
        }))
        .sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer));
      return {
        exerciseId,
        es: exercise?.es ?? null,
        reference: exercise === undefined ? null : (expandAccepted(exercise.accepted)[0] ?? null),
        total: list.reduce((sum, a) => sum + a.count, 0),
        answers: list,
      };
    })
    .sort((a, b) => b.total - a.total || a.exerciseId.localeCompare(b.exerciseId));
}

export function formatDisputes(groups: readonly DisputeGroup[]): string {
  const lines = groups.flatMap((group) => [
    `${group.exerciseId} (${group.total})`,
    group.es === null ? "  (exercise not found in the content)" : `  ES: ${group.es}`,
    ...(group.reference === null ? [] : [`  Ref: ${group.reference}`]),
    ...group.answers.map(
      (a) => `  ${a.count}× ${a.answer}${a.nowAccepted ? "  (now accepted)" : ""}`,
    ),
    "",
  ]);
  const total = groups.reduce((sum, g) => sum + g.total, 0);
  return [...lines, `${total} disputed answer(s) in ${groups.length} exercise(s)`].join("\n");
}

function translateWriteExercises(): TranslateWriteExercise[] {
  return load().loaded.flatMap(({ data }) =>
    (data.exercises ?? []).filter((e): e is TranslateWriteExercise => e.type === "translate_write"),
  );
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const file = process.argv[2];
  const raw = readFileSync(file ?? 0, "utf8");
  console.log(
    formatDisputes(disputedAnswers(parseDisputes(JSON.parse(raw)), translateWriteExercises())),
  );
}
