import { isValidLocalDate, type Clock, type LocalDate } from "@english-learn/domain";

/**
 * TEST-ONLY. Lets Playwright simulate days passing with `?today=YYYY-MM-DD` on the page URL.
 * It is wired in only when the web build is exported with `EXPO_PUBLIC_E2E=1` (see
 * `app-clock.ts`), so production builds never read the URL for the date.
 */
export function todayFromSearch(search: string): LocalDate | null {
  const value = new URLSearchParams(search).get("today");
  return value !== null && isValidLocalDate(value) ? value : null;
}

/** `base` with `today()` replaced by the `?today=` date of `search`, when it has a valid one. */
export function e2eClock(base: Clock, search: string): Clock {
  const today = todayFromSearch(search);
  if (today === null) return base;
  return { today: () => today, nowMs: () => base.nowMs() };
}
