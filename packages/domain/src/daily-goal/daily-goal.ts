import type { LocalDate } from "../local-date";
import type { DailyExercises } from "../progress-log/fold";

/**
 * How much the learner wants to study per day, in exercises answered: light (10), normal (20),
 * intense (40), or no goal. A device preference, never part of the progress; missing it changes
 * nothing else.
 */
export type DailyGoal = "light" | "normal" | "intense" | "off";

/** Every goal, in the order the picker offers them. */
export const DAILY_GOALS: readonly DailyGoal[] = ["light", "normal", "intense", "off"];

export const DEFAULT_DAILY_GOAL: DailyGoal = "normal";

const TARGETS: Readonly<Record<DailyGoal, number | null>> = {
  light: 10,
  normal: 20,
  intense: 40,
  off: null,
};

/** Exercises per day the goal asks for; null without a goal. */
export function dailyGoalTarget(goal: DailyGoal): number | null {
  return TARGETS[goal];
}

export function isDailyGoal(value: unknown): value is DailyGoal {
  return typeof value === "string" && Object.hasOwn(TARGETS, value);
}

/** Where today stands against the goal. */
export type DailyGoalStatus =
  | { readonly kind: "off" }
  | {
      readonly kind: "on";
      /** Exercises answered today (a whole number, never below 0). */
      readonly done: number;
      readonly target: number;
      /** `done` reached `target`. */
      readonly met: boolean;
    };

export function dailyGoalStatus(goal: DailyGoal, exercisesToday: number): DailyGoalStatus {
  const target = dailyGoalTarget(goal);
  if (target === null) return { kind: "off" };
  const done = Math.max(0, Math.floor(exercisesToday));
  return { kind: "on", done, target, met: done >= target };
}

/** Exercises answered on `date` (0 for a day with none: each new day starts from zero). */
export function exercisesOn(daily: readonly DailyExercises[], date: LocalDate): number {
  return daily.find((d) => d.localDate === date)?.exercises ?? 0;
}
