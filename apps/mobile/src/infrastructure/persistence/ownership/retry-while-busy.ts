/**
 * What a look at the database files found:
 * - "free": no other page holds them, the database can open.
 * - "busy": another page (or the worker of the page that was just reloaded) holds them.
 * - "error": anything else; the normal open reports it (private mode, corrupt file, …).
 */
export type ProbeResult = "free" | "busy" | "error";

/**
 * Delays between probes while the database is busy: after a reload, a redirect return or an
 * update, the previous page's SQLite worker lets go of the files a moment after the new page
 * starts. About 5.5 s in total before the learner sees "open in another tab".
 */
export const RETRY_DELAYS_MS: readonly number[] = [100, 200, 400, 800, 1600, 2400];

/** Probes until the result is not "busy", waiting `delays` in between; "busy" once they run out. */
export async function retryWhileBusy(
  probe: () => Promise<ProbeResult>,
  sleep: (ms: number) => Promise<void>,
  delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<ProbeResult> {
  let result = await probe();
  for (const delay of delays) {
    if (result !== "busy") return result;
    await sleep(delay);
    result = await probe();
  }
  return result;
}
