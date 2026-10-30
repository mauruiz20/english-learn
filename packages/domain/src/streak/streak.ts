import { diffDays, type LocalDate } from "../local-date";

export type Streak = {
  readonly current: number;
  readonly longest: number;
  readonly lastActiveDate: LocalDate | null;
};

export const EMPTY_STREAK: Streak = { current: 0, longest: 0, lastActiveDate: null };

/**
 * Records study activity on `today`.
 * Same day → unchanged; next day → +1; gap of 2+ days or first activity → 1;
 * `today` before the last active date (clock skew) → unchanged.
 */
export function recordActivity(streak: Streak, today: LocalDate): Streak {
  if (streak.lastActiveDate === null) {
    return { current: 1, longest: Math.max(1, streak.longest), lastActiveDate: today };
  }
  const gap = diffDays(streak.lastActiveDate, today);
  if (gap <= 0) return streak;

  const current = gap === 1 ? streak.current + 1 : 1;
  return { current, longest: Math.max(streak.longest, current), lastActiveDate: today };
}

/** True while the streak can still be extended: last activity was today or yesterday. */
export function isStreakAlive(streak: Streak, today: LocalDate): boolean {
  if (streak.lastActiveDate === null) return false;
  return diffDays(streak.lastActiveDate, today) <= 1;
}
