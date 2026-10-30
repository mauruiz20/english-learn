import type { Clock } from "@english-learn/domain";
import type * as E2eClock from "./e2e-clock";
import { systemClock } from "./system-clock";

/**
 * The clock the app runs with. `EXPO_PUBLIC_E2E` is inlined at build time, so in a production
 * build this is `systemClock` and the e2e override below is dead code dropped by the minifier
 * (its module is only required inside the branch).
 */
export function createAppClock(): Clock {
  if (process.env.EXPO_PUBLIC_E2E === "1" && typeof window !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { e2eClock } = require("./e2e-clock") as typeof E2eClock;
    return e2eClock(systemClock, window.location.search);
  }
  return systemClock;
}
