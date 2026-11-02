type WorkerGlobals = { Worker?: unknown; __workerCount?: { created: number } };

export type WorkerCount = { created(): number };

/**
 * Counts the web workers this page creates. The page starts exactly one: expo-sqlite's, on the
 * first open (the app starts no other worker). A second one would be a SQLite worker colliding
 * with the first on the same OPFS files (WebKit `InvalidStateError`), so the count goes to
 * "Detalles técnicos" and decides whether a busy open may be retried (see `decideOpenRetry`).
 * Installed once per page; a no-op where there is no `Worker` (native, tests).
 */
export function countWorkers(globals: WorkerGlobals = globalThis as WorkerGlobals): WorkerCount {
  if (globals.__workerCount === undefined) {
    const counter = { created: 0 };
    globals.__workerCount = counter;
    if (typeof globals.Worker === "function") {
      const Original = globals.Worker as new (...args: unknown[]) => object;
      globals.Worker = class CountedWorker extends Original {
        constructor(...args: unknown[]) {
          super(...args);
          counter.created += 1;
        }
      };
    }
  }
  const counter = globals.__workerCount;
  return { created: () => counter.created };
}
