import { databaseOpenErrorKind } from "./database-open-error";

/**
 * Delays before each automatic retry of a busy open (web). A page reloaded, returned from a
 * redirect or updated can start while the previous page's SQLite worker still holds the files
 * for a moment; on iOS that release can take a while after the app comes back.
 */
export const OPEN_RETRY_DELAYS_MS: readonly number[] = [400, 1200, 2500];

const ATTEMPTS_KEY = "english-learn-db-open-retries";

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
};

type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * Web: retries by reloading the page, the only way to get a fresh SQLite worker (see
 * `createPageDatabase`). The attempt count lives in sessionStorage so it survives the reloads.
 */
export function createOpenRetry({
  storage,
  reload,
  workersCreated,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: {
  readonly storage: KeyValueStorage | undefined;
  readonly reload: () => void;
  readonly workersCreated: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}): OpenRetry {
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
  const clear = () => {
    try {
      storage?.removeItem(ATTEMPTS_KEY);
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
      if (!decision.retry || !write(attempts + 1)) return false;
      void sleep(decision.delayMs).then(reload);
      return true;
    },
    onOpened: clear,
    clear,
    attempts: read,
  };
}

/** Native: the file belongs to the app alone; a failed open shows its error at once. */
export const noOpenRetry: OpenRetry = {
  onFailure: () => false,
  onOpened: () => {},
  clear: () => {},
  attempts: () => 0,
};
