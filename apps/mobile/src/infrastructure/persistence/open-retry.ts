import { databaseOpenErrorKind } from "./database-open-error";

/**
 * Delays before each automatic retry of a busy open (web), about 16 s in all. A page reloaded,
 * returned from a redirect or updated can start while the previous page's SQLite worker still
 * holds the files for a moment; on iOS the storage process can keep stale handles for several
 * seconds after the app comes back (or after a restart). Meanwhile "Abriendo tus datos…".
 */
export const OPEN_RETRY_DELAYS_MS: readonly number[] = [400, 800, 1600, 3000, 5000, 5000];

/** How long a busy open waits (delays only; each reload adds its own load time). */
export const OPEN_RETRY_WINDOW_MS = OPEN_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0);

const ATTEMPTS_KEY = "english-learn-db-open-retries";
/** When the round's first busy open failed (epoch ms), for the total wait in the details. */
const SINCE_KEY = "english-learn-db-open-retries-since";

/** "Espera total" for "Detalles técnicos": seconds with one decimal, Spanish comma. */
export function formatWait(ms: number | null): string {
  if (ms === null) return "sin espera";
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

export type OpenRetryDecision =
  | { readonly retry: true; readonly delayMs: number }
  | {
      readonly retry: false;
      readonly why: "not-busy" | "own-collision" | "exhausted" | "no-storage";
    };

/**
 * Whether a failed open is worth retrying. Only a busy file (`InvalidStateError` on WebKit,
 * "another open Access Handle" on Chromium) and only while THIS page started a single database
 * worker: with two, the collision is the page's own and retrying would hide the bug. Without a
 * working attempt counter a retry could loop forever, so none.
 */
export function decideOpenRetry({
  error,
  attempts,
  workersCreated,
  storageWorks,
}: {
  readonly error: unknown;
  readonly attempts: number;
  readonly workersCreated: number;
  readonly storageWorks: boolean;
}): OpenRetryDecision {
  if (databaseOpenErrorKind(error) !== "open-elsewhere") return { retry: false, why: "not-busy" };
  if (workersCreated > 1) return { retry: false, why: "own-collision" };
  if (!storageWorks) return { retry: false, why: "no-storage" };
  const delayMs = OPEN_RETRY_DELAYS_MS[attempts];
  if (delayMs === undefined) return { retry: false, why: "exhausted" };
  return { retry: true, delayMs };
}

/** What the database provider asks about failed and successful opens. */
export type OpenRetry = {
  /** A failed open: true when a retry (a page reload) is scheduled instead of an error. */
  onFailure(error: unknown): boolean;
  /** The database opened: the next failure starts a fresh round of retries. */
  onOpened(): void;
  /** "Reintentar": the learner asks for a fresh round. */
  clear(): void;
  /** Automatic retries so far (for "Detalles técnicos"). */
  attempts(): number;
  /** Milliseconds since this round's first busy open failed; null when none failed. */
  waitedMs(): number | null;
  /**
   * The window is used up but the files were only busy: the error screen keeps trying on its
   * own (`retryInBackground`) and the app opens as soon as they are free.
   */
  retriesInBackground(): boolean;
  /** One more try from the error screen: reloads (no history entry), keeping the count. */
  retryInBackground(): void;
};

type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * Web: retries by reloading the page, the only way to get a fresh SQLite worker (see
 * `createPageDatabase`: expo-sqlite's worker keeps a failed VFS init, and the handles it did
 * acquire, until the page goes away). `location.reload()` adds no history entry. The attempt
 * count and the round's start live in sessionStorage so they survive the reloads.
 */
export function createOpenRetry({
  storage,
  reload,
  workersCreated,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
}: {
  readonly storage: KeyValueStorage | undefined;
  readonly reload: () => void;
  readonly workersCreated: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}): OpenRetry {
  let exhausted = false;
  let reloading = false;
  const read = (): number => {
    try {
      return Number(storage?.getItem(ATTEMPTS_KEY) ?? 0) || 0;
    } catch {
      return 0;
    }
  };
  /** Writes the count and reads it back: false when the storage does not keep it. */
  const write = (value: number): boolean => {
    try {
      if (storage === undefined) return false;
      storage.setItem(ATTEMPTS_KEY, String(value));
      return read() === value;
    } catch {
      return false;
    }
  };
  const since = (): number | null => {
    try {
      const value = Number(storage?.getItem(SINCE_KEY) ?? Number.NaN);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  };
  const clear = () => {
    exhausted = false;
    try {
      storage?.removeItem(ATTEMPTS_KEY);
      storage?.removeItem(SINCE_KEY);
    } catch {
      // Nothing stored then.
    }
  };
  return {
    onFailure(error) {
      const attempts = read();
      const decision = decideOpenRetry({
        error,
        attempts,
        workersCreated: workersCreated(),
        storageWorks: write(attempts),
      });
      exhausted = !decision.retry && decision.why === "exhausted";
      if (!decision.retry || !write(attempts + 1)) return false;
      if (attempts === 0) {
        try {
          storage?.setItem(SINCE_KEY, String(now()));
        } catch {
          // The details then show no total wait.
        }
      }
      void sleep(decision.delayMs).then(reload);
      return true;
    },
    onOpened: clear,
    clear,
    attempts: read,
    waitedMs() {
      const start = since();
      return start === null ? null : Math.max(0, now() - start);
    },
    retriesInBackground: () => exhausted,
    retryInBackground() {
      if (!exhausted || reloading) return;
      reloading = true;
      reload();
    },
  };
}

/** Native: the file belongs to the app alone; a failed open shows its error at once. */
export const noOpenRetry: OpenRetry = {
  onFailure: () => false,
  onOpened: () => {},
  clear: () => {},
  attempts: () => 0,
  waitedMs: () => null,
  retriesInBackground: () => false,
  retryInBackground: () => {},
};
