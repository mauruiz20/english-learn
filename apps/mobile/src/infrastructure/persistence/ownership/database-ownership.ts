import { retryWhileBusy, type ProbeResult } from "./retry-while-busy";

/**
 * Messages on the `english-learn-db` BroadcastChannel:
 * - "want-db": a page starts and asks whether another one owns the database.
 * - "owned": the owner answers `from` (the asking page).
 * - "release": a page asks the owner to hand the database over ("Usar aquí").
 * - "released": the owner drained its writes and is about to reload without the database.
 */
export type OwnershipMessage =
  | { readonly type: "want-db"; readonly from: string }
  | { readonly type: "owned"; readonly to: string }
  | { readonly type: "release"; readonly from: string }
  | { readonly type: "released"; readonly to: string };

export type OwnershipChannel = {
  post(message: OwnershipMessage): void;
  subscribe(listener: (message: OwnershipMessage) => void): () => void;
};

/** One exclusive lock per origin, held for the page's lifetime (released when it unloads). */
export type OwnershipLocks = {
  /** Takes the lock if nobody holds it. */
  tryAcquire(): Promise<boolean>;
  /** Waits up to `timeoutMs` for the lock. */
  acquire(timeoutMs: number): Promise<boolean>;
};

export type OwnershipPorts = {
  readonly pageId: string;
  readonly channel: OwnershipChannel | null;
  readonly locks: OwnershipLocks | null;
  /** Looks at the database files without keeping them (see `retryWhileBusy`). */
  readonly probe: () => Promise<ProbeResult>;
  readonly sleep: (ms: number) => Promise<void>;
  /** "This page just handed the database over": survives the reload that follows, read once. */
  readonly releasedFlag: { consume(): boolean; set(): void };
  /** Reloads the page: the only way to stop expo-sqlite's worker and free the files. */
  readonly reload: () => void;
};

export type ClaimResult = "owned" | "open-elsewhere";

export interface DatabaseOwnership {
  /** On page start: "released" right after this page handed the database to another one. */
  start(): Promise<ClaimResult | "released">;
  /** "Usar aquí": asks the current owner to release the database, then claims it. */
  takeOver(): Promise<ClaimResult>;
  /**
   * While this page owns the database: answers other pages and, when one asks for it, runs
   * `release` (finish pending writes, stop work), then reloads. Returns a stop function.
   */
  serve(release: () => Promise<void>): () => void;
}

/** How long a starting page waits for an owner to answer "owned". */
export const OWNER_REPLY_MS = 400;
/** How long "Usar aquí" waits for the owner's "released". */
export const RELEASE_REPLY_MS = 3000;
/** How long a page waits for the lock of a page that is unloading. */
export const LOCK_WAIT_MS = 6000;

export function createDatabaseOwnership(ports: OwnershipPorts): DatabaseOwnership {
  const { pageId, channel, locks } = ports;
  let holdingLock = false;

  /** Posts `message` and resolves true when `isReply` matches a message within `timeoutMs`. */
  const ask = (
    message: OwnershipMessage,
    isReply: (reply: OwnershipMessage) => boolean,
    timeoutMs: number,
  ): Promise<boolean> => {
    if (channel === null) return Promise.resolve(false);
    return new Promise((resolve) => {
      const unsubscribe = channel.subscribe((reply) => {
        if (!isReply(reply)) return;
        clearTimeout(timer);
        unsubscribe();
        resolve(true);
      });
      const timer = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, timeoutMs);
      channel.post(message);
    });
  };

  const ownerAnswers = () =>
    ask(
      { type: "want-db", from: pageId },
      (reply) => reply.type === "owned" && reply.to === pageId,
      OWNER_REPLY_MS,
    );

  const probeUntilFree = async (): Promise<ClaimResult> =>
    (await retryWhileBusy(ports.probe, ports.sleep)) === "busy" ? "open-elsewhere" : "owned";

  const claim = async (askOwner: boolean): Promise<ClaimResult> => {
    if (locks !== null && !holdingLock) {
      holdingLock = await locks.tryAcquire();
      if (!holdingLock) {
        if (askOwner && (await ownerAnswers())) return "open-elsewhere";
        // Nobody answered: the owner is unloading (reload, redirect, update). Wait for it.
        holdingLock = await locks.acquire(LOCK_WAIT_MS);
        if (!holdingLock) return "open-elsewhere";
      }
    } else if (locks === null && askOwner && (await ownerAnswers())) {
      return "open-elsewhere";
    }
    return probeUntilFree();
  };

  return {
    async start() {
      if (ports.releasedFlag.consume()) return "released";
      return claim(true);
    },

    async takeOver() {
      await ask(
        { type: "release", from: pageId },
        (reply) => reply.type === "released" && reply.to === pageId,
        RELEASE_REPLY_MS,
      );
      return claim(false);
    },

    serve(release) {
      if (channel === null) return () => {};
      let releasing = false;
      return channel.subscribe((message) => {
        if (message.type === "want-db") {
          channel.post({ type: "owned", to: message.from });
        } else if (message.type === "release" && !releasing) {
          releasing = true;
          void release()
            .catch((error: unknown) => console.error("Releasing the database failed", error))
            .then(() => {
              ports.releasedFlag.set();
              channel.post({ type: "released", to: message.from });
              ports.reload();
            });
        }
      });
    },
  };
}
