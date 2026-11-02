import { databaseOpenErrorKind } from "../database-open-error";
import {
  createDatabaseOwnership,
  type DatabaseOwnership,
  type LockAttempt,
  type OwnershipChannel,
  type OwnershipLocks,
  type OwnershipMessage,
} from "./database-ownership";
import { browserEnvironment } from "./ownership-environment";
import type { ProbeOutcome } from "./retry-while-busy";

const CHANNEL_NAME = "english-learn-db";
const LOCK_NAME = "english-learn-db-owner";
const RELEASED_KEY = "english-learn-db-released";
const ATTEMPTS_KEY = "english-learn-db-takeover-attempts";
/** Set once the probe said "busy" and the database then opened fine: the probe lies here. */
const PROBE_DISTRUSTED_KEY = "english-learn-db-probe-distrusted";
/** expo-sqlite's OPFS directory (its AccessHandlePoolVFS name). */
const OPFS_DIRECTORY = "expo-sqlite";
const PROBE_TIMEOUT_MS = 3000;

type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
// The browser APIs used here, typed locally (the app's TypeScript lib has no DOM types).
type BrowserChannel = {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
};
type LockRequestOptions = { ifAvailable?: boolean; signal?: AbortSignal };
type LockManager = {
  query?: () => Promise<{ held?: { name?: string }[] }>;
  request(
    name: string,
    options: LockRequestOptions,
    callback: (lock: object | null) => Promise<unknown> | undefined,
  ): Promise<unknown>;
};
type BrowserWorker = {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
};
type BrowserGlobals = {
  BroadcastChannel?: new (name: string) => BrowserChannel;
  navigator?: { locks?: LockManager };
  Worker?: new (url: string) => BrowserWorker;
  Blob?: new (parts: string[], options: { type: string }) => object;
  URL: { createObjectURL(blob: object): string; revokeObjectURL(url: string): void };
  sessionStorage?: KeyValueStorage;
  localStorage?: KeyValueStorage;
  location?: { reload(): void };
  crypto?: { randomUUID?: () => string };
};
const browser = globalThis as unknown as BrowserGlobals;

const MESSAGE_TYPES = new Set(["want-db", "owned", "release", "released"]);
function isOwnershipMessage(data: unknown): data is OwnershipMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    MESSAGE_TYPES.has(String((data as { type?: unknown }).type))
  );
}

function broadcastChannel(): OwnershipChannel | null {
  if (browser.BroadcastChannel === undefined) return null;
  const channel = new browser.BroadcastChannel(CHANNEL_NAME);
  const listeners = new Set<(message: OwnershipMessage) => void>();
  channel.onmessage = ({ data }) => {
    if (!isOwnershipMessage(data)) return;
    for (const listener of [...listeners]) listener(data);
  };
  return {
    post: (message) => channel.postMessage(message),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

const errorName = (error: unknown) =>
  typeof error === "object" && error !== null && "name" in error
    ? String((error as { name: unknown }).name)
    : "Error";

/** The owner lock: once granted, held until the page unloads (its callback never settles). */
function webLocks(): OwnershipLocks | null {
  const locks = browser.navigator?.locks;
  if (locks === undefined) return null;
  const hold = (options: LockRequestOptions, timedOut: () => boolean) =>
    new Promise<LockAttempt>((resolve) => {
      try {
        locks
          .request(LOCK_NAME, options, (lock) => {
            resolve(lock === null ? "unavailable" : "acquired");
            return lock === null ? undefined : new Promise(() => {});
          })
          // Our own timeout aborts the request: the lock stayed taken. Anything else is a broken
          // request, which says nothing about another page.
          .catch((error: unknown) =>
            resolve(timedOut() ? "unavailable" : { error: errorName(error) }),
          );
      } catch (error) {
        resolve({ error: errorName(error) });
      }
    });
  return {
    tryAcquire: () => hold({ ifAvailable: true }, () => false),
    acquire(timeoutMs) {
      const controller = new AbortController();
      let expired = false;
      const timer = setTimeout(() => {
        expired = true;
        controller.abort();
      }, timeoutMs);
      return hold({ signal: controller.signal }, () => expired).finally(() => clearTimeout(timer));
    },
    async holders() {
      if (typeof locks.query !== "function") return null;
      try {
        const snapshot = await locks.query();
        return (snapshot.held ?? []).filter((lock) => lock.name === LOCK_NAME).length;
      } catch {
        return null;
      }
    },
  };
}

// Runs in a throwaway worker (OPFS sync access handles exist only in workers): opens a handle
// on each of expo-sqlite's files and closes them all again. A file another page's worker holds
// fails to open. It must not use expo-sqlite's own worker: after a failed open that worker
// cannot open the database again until the page reloads.
const PROBE_SOURCE = `
self.onmessage = async (event) => {
  const handles = [];
  let result = { ok: true };
  try {
    const root = await navigator.storage.getDirectory();
    let directory = null;
    try {
      directory = await root.getDirectoryHandle(event.data);
    } catch (error) {
      if (!error || error.name !== "NotFoundError") throw error;
    }
    if (directory) {
      for await (const [, handle] of directory) {
        if (handle.kind === "file") handles.push(await handle.createSyncAccessHandle());
      }
    }
  } catch (error) {
    result = { ok: false, name: String(error && error.name), message: String(error && error.message) };
  }
  for (const handle of handles) {
    try { handle.close(); } catch {}
  }
  self.postMessage(result);
};
`;

function classifyProbe(data: unknown): ProbeOutcome {
  const result = data as { ok?: boolean; name?: string; message?: string } | null;
  if (result?.ok === true) return { result: "free" };
  const error = new Error(result?.message ?? "");
  error.name = result?.name ?? "Error";
  return {
    result: databaseOpenErrorKind(error) === "open-elsewhere" ? "busy" : "error",
    error: error.name,
  };
}

function probeDatabaseFiles(): Promise<ProbeOutcome> {
  return new Promise((resolve) => {
    let worker: BrowserWorker | null = null;
    let url: string | null = null;
    const finish = (outcome: ProbeOutcome) => {
      clearTimeout(timer);
      worker?.terminate();
      if (url !== null) browser.URL.revokeObjectURL(url);
      resolve(outcome);
    };
    // No answer (no Worker, blocked blob URL, …): let the normal open decide.
    const timer = setTimeout(
      () => finish({ result: "error", error: "ProbeTimeout" }),
      PROBE_TIMEOUT_MS,
    );
    try {
      if (browser.Worker === undefined || browser.Blob === undefined) throw new Error("no Worker");
      url = browser.URL.createObjectURL(
        new browser.Blob([PROBE_SOURCE], { type: "text/javascript" }),
      );
      worker = new browser.Worker(url);
      worker.onmessage = ({ data }) => finish(classifyProbe(data));
      worker.onerror = () => finish({ result: "error", error: "ProbeWorkerError" });
      worker.postMessage(OPFS_DIRECTORY);
    } catch {
      finish({ result: "error", error: "ProbeUnavailable" });
    }
  });
}

/** Storage access that never throws (Safari private mode, blocked site data). */
function storageOf(name: "sessionStorage" | "localStorage") {
  return {
    get(key: string): string | null {
      try {
        return browser[name]?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key: string, value: string) {
      try {
        browser[name]?.setItem(key, value);
      } catch {
        // Without storage the page simply behaves as on its first start.
      }
    },
    remove(key: string) {
      try {
        browser[name]?.removeItem(key);
      } catch {
        // Same as above.
      }
    },
  };
}

const session = storageOf("sessionStorage");
const local = storageOf("localStorage");

const takeOverAttempts = {
  count: () => Number(session.get(ATTEMPTS_KEY) ?? 0) || 0,
  increment: () => session.set(ATTEMPTS_KEY, String(takeOverAttempts.count() + 1)),
  clear: () => session.remove(ATTEMPTS_KEY),
};

const probeTrust = {
  trusted: () => local.get(PROBE_DISTRUSTED_KEY) !== "1",
  distrust: () => local.set(PROBE_DISTRUSTED_KEY, "1"),
};

const releasedFlag = {
  consume() {
    const released = session.get(RELEASED_KEY) === "1";
    session.remove(RELEASED_KEY);
    return released;
  },
  set: () => session.set(RELEASED_KEY, "1"),
};

/**
 * Web: one page owns the OPFS database at a time (Web Lock `english-learn-db-owner`); pages talk
 * over the `english-learn-db` BroadcastChannel. See `createDatabaseOwnership`.
 */
export function createBrowserOwnership(): DatabaseOwnership {
  return createDatabaseOwnership({
    pageId: browser.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    channel: broadcastChannel(),
    locks: webLocks(),
    probe: probeDatabaseFiles,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    releasedFlag,
    takeOverAttempts,
    probeTrust,
    now: Date.now,
    environment: browserEnvironment,
    reload: () => browser.location?.reload(),
  });
}
