type Counter = { created: number; workers: object[] };
type WorkerGlobals = { Worker?: unknown; __workerCount?: Counter };

export type WorkerCount<W = object> = {
  created(): number;
  /** The workers this page created (expo-sqlite's), so it can end them before it leaves. */
  workers(): readonly W[];
};

/**
 * Counts the web workers this page creates. The page starts exactly one: expo-sqlite's, on the
 * first open (the app starts no other worker). A second one would be a SQLite worker colliding
 * with the first on the same OPFS files (WebKit `InvalidStateError`), so the count goes to
 * "Detalles técnicos" and decides whether a busy open may be retried (see `decideOpenRetry`).
 * It also keeps them: expo-sqlite's worker is private to the library, and the page must end it
 * before it leaves (see `createPageRelease`).
 * Installed once per page; a no-op where there is no `Worker` (native, tests).
 */
export function countWorkers<W = object>(
  globals: WorkerGlobals = globalThis as WorkerGlobals,
): WorkerCount<W> {
  if (globals.__workerCount === undefined) {
    const counter: Counter = { created: 0, workers: [] };
    globals.__workerCount = counter;
    if (typeof globals.Worker === "function") {
      const Original = globals.Worker as new (...args: unknown[]) => object;
      globals.Worker = class CountedWorker extends Original {
        constructor(...args: unknown[]) {
          super(...args);
          counter.created += 1;
          counter.workers.push(this);
        }
      };
    }
  }
  const counter = globals.__workerCount;
  return { created: () => counter.created, workers: () => counter.workers as W[] };
}
