/**
 * The app's database, opened at most once per page (web) or until a retry (native).
 *
 * Web: expo-sqlite runs every database in one worker per page, created on the first open. Its
 * OPFS VFS takes a sync access handle on each of its files and a file accepts only one, so a
 * second acquisition of the same files in the same page (a second open racing the first one, a
 * second worker) fails with WebKit's `InvalidStateError`. And after a failed open that worker
 * never opens again (its VFS stays uninitialized until the page reloads). So the open runs once
 * and its result, success or failure, is kept for the page's lifetime: remounting the provider,
 * re-rendering or an error boundary retry never open again; only a page reload does.
 *
 * Native: `reopenable` lets "Reintentar" forget a failed open and try again.
 */
export type PageDatabase<Db> = {
  /** The page's database; `open` runs only if nothing opened (or is opening) yet. */
  get(open: () => Promise<Db>): Promise<Db>;
  /** Native retry: forget the last open. Web: no-op (only a reload opens again). */
  reset(): void;
  /** How many opens this page started (web: never more than one). */
  opens(): number;
};

export function createPageDatabase<Db>({
  reopenable,
}: {
  readonly reopenable: boolean;
}): PageDatabase<Db> {
  let current: Promise<Db> | null = null;
  let opens = 0;
  return {
    get(open) {
      if (current === null) {
        opens += 1;
        current = open();
      }
      return current;
    },
    reset() {
      if (reopenable) current = null;
    },
    opens: () => opens,
  };
}
