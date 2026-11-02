/**
 * What a look at the database files found:
 * - "free": no other page holds them, the database can open.
 * - "busy": opening a file failed with an error that USUALLY means another handle holds it. On
 *   iOS WebKit the same errors also show up without any other holder, so "busy" alone is never
 *   proof of another tab (see `createDatabaseOwnership`).
 * - "error": anything else; the normal open reports it (private mode, corrupt file, …).
 */
export type ProbeResult = "free" | "busy" | "error";

/** A probe's result and, when it failed, the browser error's name (for the diagnostics). */
export type ProbeOutcome = { readonly result: ProbeResult; readonly error?: string };

/**
 * Delays between probes while the database is busy: after a reload, a redirect return or an
 * update, the previous page's SQLite worker lets go of the files a moment after the new page
 * starts. About 5.5 s in total.
 */
export const RETRY_DELAYS_MS: readonly number[] = [100, 200, 400, 800, 1600, 2400];

/** Probes until the result is not "busy", waiting `delays` in between; "busy" once they run out. */
export async function retryWhileBusy(
  probe: () => Promise<ProbeOutcome>,
  sleep: (ms: number) => Promise<void>,
  delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<ProbeOutcome> {
  let outcome = await probe();
  for (const delay of delays) {
    if (outcome.result !== "busy") return outcome;
    await sleep(delay);
    outcome = await probe();
  }
  return outcome;
}
