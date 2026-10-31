import { databaseOpenErrorKind } from "../database-open-error";
import {
  createDatabaseOwnership,
  type DatabaseOwnership,
  type OwnershipChannel,
  type OwnershipLocks,
  type OwnershipMessage,
} from "./database-ownership";
import type { ProbeResult } from "./retry-while-busy";

const CHANNEL_NAME = "english-learn-db";
const LOCK_NAME = "english-learn-db-owner";
const RELEASED_KEY = "english-learn-db-released";
/** expo-sqlite's OPFS directory (its AccessHandlePoolVFS name). */
const OPFS_DIRECTORY = "expo-sqlite";
const PROBE_TIMEOUT_MS = 3000;

// The browser APIs used here, typed locally (the app's TypeScript lib has no DOM types).
type BrowserChannel = {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
};
type LockRequestOptions = { ifAvailable?: boolean; signal?: AbortSignal };
type LockManager = {
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
  sessionStorage?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
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

/** The owner lock: once granted, held until the page unloads (its callback never settles). */
function webLocks(): OwnershipLocks | null {
  const locks = browser.navigator?.locks;
  if (locks === undefined) return null;
  const hold = (options: LockRequestOptions) =>
    new Promise<boolean>((resolve) => {
      locks
        .request(LOCK_NAME, options, (lock) => {
          resolve(lock !== null);
          return lock === null ? undefined : new Promise(() => {});
        })
        .catch(() => resolve(false));
    });
  return {
    tryAcquire: () => hold({ ifAvailable: true }),
    acquire(timeoutMs) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      return hold({ signal: controller.signal }).finally(() => clearTimeout(timer));
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

function classifyProbe(data: unknown): ProbeResult {
  const result = data as { ok?: boolean; name?: string; message?: string } | null;
  if (result?.ok === true) return "free";
  const error = new Error(result?.message ?? "");
  error.name = result?.name ?? "Error";
  return databaseOpenErrorKind(error) === "open-elsewhere" ? "busy" : "error";
}

function probeDatabaseFiles(): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let worker: BrowserWorker | null = null;
    let url: string | null = null;
    const finish = (result: ProbeResult) => {
      clearTimeout(timer);
      worker?.terminate();
      if (url !== null) browser.URL.revokeObjectURL(url);
      resolve(result);
    };
    // No answer (no Worker, blocked blob URL, …): let the normal open decide.
    const timer = setTimeout(() => finish("error"), PROBE_TIMEOUT_MS);
    try {
      if (browser.Worker === undefined || browser.Blob === undefined) throw new Error("no Worker");
      url = browser.URL.createObjectURL(
        new browser.Blob([PROBE_SOURCE], { type: "text/javascript" }),
      );
      worker = new browser.Worker(url);
      worker.onmessage = ({ data }) => finish(classifyProbe(data));
      worker.onerror = () => finish("error");
      worker.postMessage(OPFS_DIRECTORY);
    } catch {
      finish("error");
    }
  });
}

const releasedFlag = {
  consume() {
    try {
      const released = browser.sessionStorage?.getItem(RELEASED_KEY) === "1";
      browser.sessionStorage?.removeItem(RELEASED_KEY);
      return released;
    } catch {
      return false;
    }
  },
  set() {
    try {
      browser.sessionStorage?.setItem(RELEASED_KEY, "1");
    } catch {
      // Without storage the reloaded page simply claims the database again.
    }
  },
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
    reload: () => browser.location?.reload(),
  });
}
