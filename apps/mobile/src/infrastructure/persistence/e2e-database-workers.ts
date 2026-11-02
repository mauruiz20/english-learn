/**
 * TEST-ONLY. Exposes how many workers this page created as `window.__e2e.dbWorkers`, so e2e
 * specs can check the page runs exactly one SQLite worker (see `countWorkers`). Wired in only
 * when the web build is exported with `EXPO_PUBLIC_E2E=1`; never in production.
 */
export function exposeDatabaseWorkers(created: () => number): void {
  const host = globalThis as unknown as { __e2e?: Record<string, unknown> };
  host.__e2e ??= {};
  Object.defineProperty(host.__e2e, "dbWorkers", { get: created, configurable: true });
}
