import type { ReviewState } from "../srs";

export const DEFAULT_MASTERY_INTERVAL_DAYS = 21;

export type LevelProgressInput = {
  readonly itemIds: readonly string[];
  readonly states: readonly ReviewState[];
  readonly masteryIntervalDays?: number;
};

export type LevelProgress = {
  readonly total: number;
  /** Items reviewed at least once. */
  readonly seen: number;
  /** Items whose current interval is ≥ masteryIntervalDays. */
  readonly mastered: number;
  /** mastered / total (0 for an empty level). */
  readonly ratio: number;
};

export function levelProgress({
  itemIds,
  states,
  masteryIntervalDays = DEFAULT_MASTERY_INTERVAL_DAYS,
}: LevelProgressInput): LevelProgress {
  const byId = new Map(states.map((s) => [s.itemId, s]));
  const ids = [...new Set(itemIds)];
  const levelStates = ids.flatMap((id) => {
    const state = byId.get(id);
    return state && state.intervalDays > 0 ? [state] : [];
  });

  const total = ids.length;
  const mastered = levelStates.filter((s) => s.intervalDays >= masteryIntervalDays).length;
  return { total, seen: levelStates.length, mastered, ratio: total === 0 ? 0 : mastered / total };
}
