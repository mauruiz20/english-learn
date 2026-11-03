import {
  createDatabaseOwnership,
  type DatabaseOwnership,
  type LockAttempt,
  type OwnershipChannel,
  type OwnershipLocks,
  type OwnershipMessage,
} from "./database-ownership";
import { browserEnvironment } from "./ownership-environment";

const CHANNEL_NAME = "english-learn-db";
const LOCK_NAME = "english-learn-db-owner";
const RELEASED_KEY = "english-learn-db-released";
const ATTEMPTS_KEY = "english-learn-db-takeover-attempts";

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
type BrowserGlobals = {
  BroadcastChannel?: new (name: string) => BrowserChannel;
  navigator?: { locks?: LockManager };
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

/** Settles the callbacks of the owner locks this page holds (see `letGoOfOwnerLock`). */
const heldLocks = new Set<() => void>();

/**
 * Lets go of the owner lock before the page leaves (see `createPageRelease`): iOS may keep the
 * page frozen in its back/forward cache, and the next page must not find the lock taken.
 */
export function letGoOfOwnerLock(): void {
  for (const letGo of [...heldLocks]) letGo();
  heldLocks.clear();
}

/**
 * The owner lock: once granted, held until the page unloads or lets go of it before leaving
 * (its callback settles only then).
 */
function webLocks(): OwnershipLocks | null {
  const locks = browser.navigator?.locks;
  if (locks === undefined) return null;
  const hold = (options: LockRequestOptions, timedOut: () => boolean) =>
    new Promise<LockAttempt>((resolve) => {
      try {
        locks
          .request(LOCK_NAME, options, (lock) => {
            resolve(lock === null ? "unavailable" : "acquired");
            return lock === null
              ? undefined
              : new Promise<void>((letGo) => void heldLocks.add(letGo));
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

/** Storage access that never throws (Safari private mode, blocked site data). */
function storageOf(name: "sessionStorage") {
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

const takeOverAttempts = {
  count: () => Number(session.get(ATTEMPTS_KEY) ?? 0) || 0,
  increment: () => session.set(ATTEMPTS_KEY, String(takeOverAttempts.count() + 1)),
  clear: () => session.remove(ATTEMPTS_KEY),
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
    releasedFlag,
    takeOverAttempts,
    now: Date.now,
    environment: browserEnvironment,
    reload: () => browser.location?.reload(),
  });
}
