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

/** A lock request's outcome: granted, held by someone else, or the request itself failed. */
export type LockAttempt = "acquired" | "unavailable" | { readonly error: string };

/** One exclusive lock per origin, held for the page's lifetime (released when it unloads). */
export type OwnershipLocks = {
  /** Takes the lock if nobody holds it. */
  tryAcquire(): Promise<LockAttempt>;
  /** Waits up to `timeoutMs` for the lock. */
  acquire(timeoutMs: number): Promise<LockAttempt>;
  /** How many clients hold the lock (`navigator.locks.query()`); null when it cannot tell. */
  holders(): Promise<number | null>;
};

/** What the browser offers, for the diagnostics ("Detalles técnicos"). No personal data. */
export type OwnershipEnvironment = {
  readonly webLocks: boolean;
  readonly broadcastChannel: boolean;
  readonly opfs: boolean;
  readonly displayMode: "standalone" | "browser" | "unknown";
};

/**
 * Why the page ended where it did (short codes the learner can screenshot):
 * - "owner-answered": another page answered "owned" on the channel (a live tab).
 * - "lock-held": another client holds the owner lock and did not let go in time.
 * - "no-owner-answer": the lock stayed taken, yet nobody answered (a frozen or suspended page),
 *   or a lock request was never granted although nobody holds it.
 * - "lock-acquired": this page took the owner lock (the normal start).
 * - "no-locks": no Web Locks API; nobody answered on the channel.
 * - "lock-error:<name>": the Web Locks request itself failed.
 * - "native": native apps own their file alone.
 *
 * The decision never touches the database files: a page that opens sync access handles on them
 * (the old "probe") collides with its own SQLite worker on iOS (`InvalidStateError`).
 */
export type OwnershipReason =
  | "owner-answered"
  | "lock-held"
  | "no-owner-answer"
  | "lock-acquired"
  | "no-locks"
  | "native"
  | `lock-error:${string}`
  | "released";

export type OwnershipDiagnostics = {
  readonly reason: OwnershipReason;
  /** Epoch ms. */
  readonly startedAt: number;
  readonly decidedAt: number;
  /** Holders of the owner lock seen by `navigator.locks.query()`; null when unknown. */
  readonly lockHolders: number | null;
  /** "Usar aquí" / "Reintentar" presses in this tab since the database last opened. */
  readonly takeOverAttempts: number;
  readonly environment: OwnershipEnvironment;
};

/**
 * - "owned": open the database (it may still fail; the real error is shown then).
 * - "open-elsewhere": positive evidence of another live page ("Usar aquí").
 * - "stuck": something holds the database and does not answer: explain how to free it.
 * - "released": this page just handed the database to another one.
 */
export type OwnershipState = {
  readonly kind: "owned" | "open-elsewhere" | "stuck" | "released";
  readonly diagnostics: OwnershipDiagnostics;
};

export type OwnershipPorts = {
  readonly pageId: string;
  readonly channel: OwnershipChannel | null;
  readonly locks: OwnershipLocks | null;
  /** "This page just handed the database over": survives the reload that follows, read once. */
  readonly releasedFlag: { consume(): boolean; set(): void };
  /** Failed "Usar aquí" presses in this tab (sessionStorage): survive reloads, catch loops. */
  readonly takeOverAttempts: { count(): number; increment(): void; clear(): void };
  readonly now: () => number;
  readonly environment: () => OwnershipEnvironment;
  /** Reloads the page: the only way to stop expo-sqlite's worker and free the files. */
  readonly reload: () => void;
};

export interface DatabaseOwnership {
  /** On page start. */
  start(): Promise<OwnershipState>;
  /** "Usar aquí": asks the current owner to release the database, then claims it. */
  takeOver(): Promise<OwnershipState>;
  /** "Reintentar" on the help screen: like `takeOver`, waiting longer for the lock. */
  retry(): Promise<OwnershipState>;
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
/** "Reintentar" on the help screen waits longer (the learner may be closing the other app). */
export const RETRY_LOCK_WAIT_MS = 15_000;

type Claim = Omit<OwnershipState, "diagnostics"> & {
  readonly reason: OwnershipReason;
  readonly lockHolders: number | null;
};

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

  /**
   * Another page has the database only with POSITIVE evidence: an "owned" answer, or a lock
   * that another client holds (and keeps). A failed lock request, a lock nobody holds, or files
   * that look busy are not evidence: on iOS WebKit they happen without any other page, and
   * claiming "another tab" then locks the learner out for good. The database opens instead, and
   * a real conflict surfaces as the open's own error.
   */
  const claim = async (askOwner: boolean, lockWaitMs: number): Promise<Claim> => {
    let lockHolders: number | null = null;
    let lockNote: OwnershipReason | null = null;

    if (locks !== null && !holdingLock) {
      let attempt = await locks.tryAcquire();
      if (attempt === "unavailable") {
        if (askOwner && (await ownerAnswers())) {
          return {
            kind: "open-elsewhere",
            reason: "owner-answered",
            lockHolders,
          };
        }
        // Nobody answered: the owner may be unloading (reload, redirect, update). Wait for it.
        attempt = await locks.acquire(lockWaitMs);
      }
      if (attempt === "acquired") {
        holdingLock = true;
      } else if (attempt === "unavailable") {
        lockHolders = await locks.holders();
        // null: no query API; a lock that was never granted is held by someone.
        if (lockHolders !== 0) {
          return { kind: "open-elsewhere", reason: "lock-held", lockHolders };
        }
        lockNote = "no-owner-answer";
      } else {
        lockNote = `lock-error:${attempt.error}`;
      }
    } else if (locks === null && askOwner && (await ownerAnswers())) {
      return { kind: "open-elsewhere", reason: "owner-answered", lockHolders };
    }

    const reason = lockNote ?? (locks === null ? "no-locks" : "lock-acquired");
    return { kind: "owned", reason, lockHolders };
  };

  const finish = (claimed: Claim, startedAt: number): OwnershipState => {
    if (claimed.kind === "owned") ports.takeOverAttempts.clear();
    return {
      kind: claimed.kind,
      diagnostics: {
        reason: claimed.reason,
        startedAt,
        decidedAt: ports.now(),
        lockHolders: claimed.lockHolders,
        takeOverAttempts: ports.takeOverAttempts.count(),
        environment: ports.environment(),
      },
    };
  };

  const takeOverWith = async (lockWaitMs: number): Promise<OwnershipState> => {
    const startedAt = ports.now();
    ports.takeOverAttempts.increment();
    const released = await ask(
      { type: "release", from: pageId },
      (reply) => reply.type === "released" && reply.to === pageId,
      RELEASE_REPLY_MS,
    );
    const claimed = await claim(false, lockWaitMs);
    if (claimed.kind !== "open-elsewhere") return finish(claimed, startedAt);
    // Still taken after asking it to let go: never show the same screen again (a silent loop).
    return finish(
      { ...claimed, kind: "stuck", reason: released ? "lock-held" : "no-owner-answer" },
      startedAt,
    );
  };

  return {
    async start() {
      const startedAt = ports.now();
      if (ports.releasedFlag.consume()) {
        return finish({ kind: "released", reason: "released", lockHolders: null }, startedAt);
      }
      const claimed = await claim(true, LOCK_WAIT_MS);
      // A failed "Usar aquí" in this tab, then a reload: same holder, show the help instead.
      if (
        claimed.kind === "open-elsewhere" &&
        claimed.reason !== "owner-answered" &&
        ports.takeOverAttempts.count() > 0
      ) {
        return finish({ ...claimed, kind: "stuck" }, startedAt);
      }
      return finish(claimed, startedAt);
    },

    takeOver: () => takeOverWith(LOCK_WAIT_MS),

    retry: () => takeOverWith(RETRY_LOCK_WAIT_MS),

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
