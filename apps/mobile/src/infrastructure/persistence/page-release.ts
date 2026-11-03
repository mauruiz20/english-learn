/** How long leaving waits for in-flight writes (saves, the sync's) before releasing anyway. */
export const RELEASE_DRAIN_TIMEOUT_MS = 2000;
/** How long leaving waits for expo-sqlite's worker to confirm it closed its file handles. */
export const RELEASE_ACK_TIMEOUT_MS = 1500;

type MessageListener = (event: { data: unknown }) => void;

/** A page worker (expo-sqlite's) as seen from the page. */
export type ReleasableWorker = {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: MessageListener): void;
  removeEventListener(type: "message", listener: MessageListener): void;
  terminate(): void;
};

/**
 * Lets go of this page's database before the page goes away (web).
 *
 * expo-sqlite's OPFS VFS (`AccessHandlePoolVFS`) takes a sync access handle on every file of its
 * pool when the worker starts and keeps them for the worker's lifetime: closing the database
 * does not release them. iOS keeps a page that navigated away (the Google sign-in redirect) in
 * its back/forward cache with that worker alive, so its handles stay held and every later page
 * fails to open the database (`InvalidStateError`) until that frozen page is restored (Back) or
 * the iPhone reboots. So before every navigation or reload the app makes on purpose, and on
 * `pagehide`, the page lets go of everything:
 *
 * 1. finishes the writes in flight and refuses new ones (`drain`, bounded);
 * 2. asks the worker to close every database and every sync access handle of the pool
 *    (`releaseAccessHandles`, added by this app's patch of expo-sqlite) and waits for its answer,
 *    bounded so leaving never hangs;
 * 3. ends the worker (`terminate`), which also frees handles the worker took but could not
 *    report (an open that failed halfway);
 * 4. lets go of the owner Web Lock (see `ownership/`).
 *
 * Final: the page never opens the database again; a page restored from the back/forward cache
 * reloads (`watchPageLifecycle`).
 */
export type PageRelease = {
  /** How to finish (and then refuse) writes; registered while the database is open. */
  setDrain(drain: (() => Promise<void>) | null): void;
  /** Lets go of everything (steps 1–4). Runs once; later calls return the same promise. */
  release(): Promise<void>;
  /** `pagehide`, which cannot wait: ends the workers and lets go of the lock at once. */
  releaseNow(): void;
  /** Whether this page let go of its database (it must reload to open it again). */
  released(): boolean;
  /** Lets go of everything, then navigates (`location.assign`, `replace`, `reload`, …). */
  leave(navigate: () => void): Promise<void>;
};

const withTimeout = (promise: Promise<unknown>, ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    void promise
      .catch((error: unknown) => console.warn("Finishing writes before leaving failed", error))
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });

let nextRequest = 0;

/** Asks the worker to close its file handles; resolves on its answer or after `timeoutMs`. */
function askToRelease(worker: ReleasableWorker, timeoutMs: number): Promise<void> {
  const requestId = `english-learn-release-${Date.now()}-${nextRequest++}`;
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      resolve();
    };
    const onMessage: MessageListener = ({ data }) => {
      const reply = data as { type?: unknown; requestId?: unknown; error?: unknown } | null;
      if (reply?.type !== "accessHandlesReleased" || reply.requestId !== requestId) return;
      if (typeof reply.error === "string")
        console.warn("Releasing the database files:", reply.error);
      done();
    };
    const timer = setTimeout(done, timeoutMs);
    worker.addEventListener("message", onMessage);
    try {
      worker.postMessage({ type: "releaseAccessHandles", requestId });
    } catch {
      done();
    }
  });
}

function terminateAll(workers: readonly ReleasableWorker[]) {
  for (const worker of workers) {
    try {
      worker.terminate();
    } catch {
      // Already gone.
    }
  }
}

export function createPageRelease({
  workers,
  letGoOfLock,
  drainTimeoutMs = RELEASE_DRAIN_TIMEOUT_MS,
  ackTimeoutMs = RELEASE_ACK_TIMEOUT_MS,
}: {
  /** The page's workers (expo-sqlite's is the only one, see `countWorkers`). */
  readonly workers: () => readonly ReleasableWorker[];
  /** Lets go of the owner Web Lock. */
  readonly letGoOfLock: () => void;
  readonly drainTimeoutMs?: number;
  readonly ackTimeoutMs?: number;
}): PageRelease {
  let drain: (() => Promise<void>) | null = null;
  let releasing: Promise<void> | null = null;
  let released = false;

  const release = () => {
    if (releasing === null) {
      released = true;
      releasing = (async () => {
        if (drain !== null) await withTimeout(drain(), drainTimeoutMs);
        const current = workers();
        await Promise.all(current.map((worker) => askToRelease(worker, ackTimeoutMs)));
        terminateAll(current);
        letGoOfLock();
      })();
    }
    return releasing;
  };

  return {
    setDrain(next) {
      drain = next;
    },
    release,
    releaseNow() {
      released = true;
      terminateAll(workers());
      letGoOfLock();
    },
    released: () => released,
    async leave(navigate) {
      await release();
      navigate();
    },
  };
}

type PageTransition = Event & { readonly persisted?: boolean };

/**
 * `pagehide`: the page may be frozen in the back/forward cache next (iOS keeps its workers and
 * their file handles), and nothing can be awaited there, so the workers end at once. `pageshow`
 * of a restored page (`persisted`) that let go of its database: reload, the only way to open it
 * again (expo-sqlite's worker is gone). Returns the function that stops listening.
 */
export function watchPageLifecycle({
  target,
  release,
  reload,
}: {
  readonly target: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  readonly release: Pick<PageRelease, "releaseNow" | "released">;
  readonly reload: () => void;
}): () => void {
  const onPageHide = () => release.releaseNow();
  const onPageShow = (event: Event) => {
    if ((event as PageTransition).persisted === true && release.released()) reload();
  };
  target.addEventListener("pagehide", onPageHide);
  target.addEventListener("pageshow", onPageShow);
  return () => {
    target.removeEventListener("pagehide", onPageHide);
    target.removeEventListener("pageshow", onPageShow);
  };
}
