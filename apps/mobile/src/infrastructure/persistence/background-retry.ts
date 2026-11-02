/** How often the error screen tries again on its own while the page is visible. */
export const BACKGROUND_RETRY_INTERVAL_MS = 15_000;

type Listenable = Pick<EventTarget, "addEventListener" | "removeEventListener">;
type VisibleDocument = Listenable & { readonly visibilityState: string };

/**
 * Keeps a busy open trying from the error screen (web): every `intervalMs` while the page is
 * visible, and at once when the learner comes back to it (`visibilitychange` to visible,
 * `pageshow`, bfcache restores included, and `focus`). `retry` reloads the page, so it runs
 * once; the next page starts its own. Returns the function that stops listening.
 */
export function startBackgroundRetry({
  retry,
  page = browserPage(),
  intervalMs = BACKGROUND_RETRY_INTERVAL_MS,
}: {
  readonly retry: () => void;
  /** The browser's window and document; null without them (native, tests): interval only. */
  readonly page?: { readonly win: Listenable; readonly doc: VisibleDocument } | null;
  readonly intervalMs?: number;
}): () => void {
  const win = page?.win;
  const doc = page?.doc;
  let done = false;
  const visible = () => doc === undefined || doc.visibilityState === "visible";
  const fire = () => {
    if (done || !visible()) return;
    stop();
    retry();
  };
  const timer = setInterval(fire, intervalMs);
  win?.addEventListener("pageshow", fire);
  win?.addEventListener("focus", fire);
  doc?.addEventListener("visibilitychange", fire);
  function stop() {
    done = true;
    clearInterval(timer);
    win?.removeEventListener("pageshow", fire);
    win?.removeEventListener("focus", fire);
    doc?.removeEventListener("visibilitychange", fire);
  }
  return stop;
}

function browserPage() {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  if (typeof window.addEventListener !== "function") return null;
  return { win: window, doc: document };
}
