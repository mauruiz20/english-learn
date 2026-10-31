/** A tiny pub/sub: "progress was saved on this device". */
export function createChangeSignal() {
  const listeners = new Set<() => void>();
  return {
    emit(): void {
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type ChangeSignal = ReturnType<typeof createChangeSignal>;

export const SYNC_INTERVAL_MS = 5 * 60_000;

/**
 * The background sync triggers while signed in: a progress save on this device (a completed
 * session or placement test), the browser coming back online, and every 5 minutes while the page
 * is visible. Sign-in and app start request a sync themselves. Returns a function that stops them.
 */
export function startSyncTriggers({
  request,
  target,
  isVisible,
  localChanges,
  intervalMs = SYNC_INTERVAL_MS,
}: {
  request: () => Promise<void>;
  /** Receives `online` events (the window). */
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  isVisible: () => boolean;
  localChanges: ChangeSignal;
  intervalMs?: number;
}): () => void {
  const sync = () => void request();
  target.addEventListener("online", sync);
  const unsubscribe = localChanges.subscribe(sync);
  const timer = setInterval(() => {
    if (isVisible()) sync();
  }, intervalMs);
  return () => {
    target.removeEventListener("online", sync);
    unsubscribe();
    clearInterval(timer);
  };
}
