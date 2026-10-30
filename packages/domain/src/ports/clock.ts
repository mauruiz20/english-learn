import type { LocalDate } from "../local-date";

/** Source of time. The domain never reads the system clock directly. */
export interface Clock {
  /** The learner's current calendar date (the adapter decides the timezone). */
  today(): LocalDate;
  /** Monotonic-enough milliseconds, used to measure response times. */
  nowMs(): number;
}
