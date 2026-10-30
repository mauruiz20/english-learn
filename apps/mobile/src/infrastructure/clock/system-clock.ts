import { localDate, type Clock } from "@english-learn/domain";

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * `Clock` backed by the device clock. `today()` is the calendar date in the device's LOCAL
 * timezone (not UTC), so a streak day matches what the learner sees on their phone.
 */
export function createSystemClock(now: () => Date = () => new Date()): Clock {
  return {
    today() {
      const date = now();
      return localDate(
        `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`,
      );
    },
    nowMs() {
      return now().getTime();
    },
  };
}

export const systemClock: Clock = createSystemClock();
