import {
  DEFAULT_DAILY_GOAL,
  dailyGoalStatus,
  type DailyGoalStatus,
  type SettingsRepository,
} from "@english-learn/domain";

/**
 * Where today stands against the daily goal once a session is saved, for its summary: the
 * learner's goal (the default when it cannot be read) against `exercisesToday`. Undefined when
 * the count is unknown (the summary then says nothing about the goal).
 */
export async function sessionDailyGoal(
  settings: SettingsRepository,
  exercisesToday: number | null,
): Promise<DailyGoalStatus | undefined> {
  if (exercisesToday === null) return undefined;
  const goal = await settings.getDailyGoal().catch(() => DEFAULT_DAILY_GOAL);
  return dailyGoalStatus(goal, exercisesToday);
}
