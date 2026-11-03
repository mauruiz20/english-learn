// Simulates iOS keeping a page that navigated away in its back/forward cache, file handles
// included.
//
// On the owner's iPhone (Home Screen app), the page that redirected to Google stayed frozen in
// the back/forward cache with expo-sqlite's worker still holding the OPFS sync access handles:
// every later page of the app failed to open the database (`InvalidStateError`) until a reboot,
// and pressing Back (restoring that frozen page) made the app work again. Playwright's browsers
// never keep these pages in their back/forward cache (`pageshow.persisted` stays false), so an
// armed page here does what iOS does instead of navigating:
//
// - fires `pagehide` with `persisted: true` (unless the test turns that off),
// - freezes: its timers stop, its BroadcastChannels close (it answers nobody), `fetch` hangs, and
//   its Web Locks are let go (the iPhone's diagnostics showed the next page got the owner lock),
//   while its workers keep running and keep whatever file handles they hold,
// - and the navigation continues in a NEW page of the same context (with a copy of the frozen
//   page's `sessionStorage`, as the same tab would have), which `next()` returns.
//
// Only armed pages are kept; every other navigation (the callback page's own redirect, reloads
// of the busy-open retry) runs normally.
import type { BrowserContext, Page } from "@playwright/test";

type Left = { url: string; session: Record<string, string> };

export type BackForwardCache = {
  /** The next navigation of `page` away from itself freezes it instead (see above). */
  arm(page: Page, options?: { pagehide?: boolean }): Promise<void>;
  /** Where the frozen page was going: a new page that went there. */
  next(): Promise<Page>;
};

export async function simulateBackForwardCache(context: BrowserContext): Promise<BackForwardCache> {
  const waiting: ((left: Left) => void)[] = [];
  const left: Left[] = [];
  await context.exposeBinding("__e2eLeftPage", (_source, url: string, session: Left["session"]) => {
    const entry = { url, session };
    const resolve = waiting.shift();
    if (resolve === undefined) left.push(entry);
    else resolve(entry);
  });
  await context.addInitScript(() => {
    type Armed = { pagehide: boolean };
    const host = window as unknown as {
      __e2eBfcache?: Armed;
      __e2eLeftPage(url: string, session: Record<string, string>): void;
      navigation?: EventTarget;
    };
    let frozen = false;
    let letGoOfLocks: () => void = () => {};
    const frozenSignal = new Promise<void>((resolve) => (letGoOfLocks = resolve));

    // Web Locks: a frozen page lets go of them.
    const request = LockManager.prototype.request as (...args: unknown[]) => Promise<unknown>;
    LockManager.prototype.request = function (this: LockManager, ...args: unknown[]) {
      const callback = args[args.length - 1] as (lock: Lock | null) => unknown;
      const wrapped = (lock: Lock | null) =>
        Promise.race([Promise.resolve(callback(lock)), frozenSignal.then(() => undefined)]);
      return request.call(this, ...args.slice(0, -1), wrapped);
    } as LockManager["request"];

    // BroadcastChannels: closed (deaf and mute) once frozen.
    const channels: BroadcastChannel[] = [];
    const OriginalChannel = BroadcastChannel;
    window.BroadcastChannel = class extends OriginalChannel {
      constructor(name: string) {
        super(name);
        channels.push(this);
        if (frozen) this.close();
      }
    } as typeof BroadcastChannel;

    // Timers: the ones scheduled so far are cleared, new ones never run.
    const timeouts = new Set<number>();
    const intervals = new Set<number>();
    const { setTimeout: originalTimeout, setInterval: originalInterval } = window;
    window.setTimeout = ((handler: TimerHandler, ms?: number, ...rest: unknown[]) => {
      if (frozen) return 0;
      const id = originalTimeout(handler, ms, ...rest);
      timeouts.add(id);
      return id;
    }) as typeof setTimeout;
    window.setInterval = ((handler: TimerHandler, ms?: number, ...rest: unknown[]) => {
      if (frozen) return 0;
      const id = originalInterval(handler, ms, ...rest);
      intervals.add(id);
      return id;
    }) as typeof setInterval;

    const freeze = () => {
      frozen = true;
      for (const id of timeouts) clearTimeout(id);
      for (const id of intervals) clearInterval(id);
      for (const channel of channels) channel.close();
      window.fetch = () => new Promise<Response>(() => {});
      letGoOfLocks();
    };

    host.navigation?.addEventListener("navigate", (event) => {
      const navigate = event as Event & { destination: { url: string; sameDocument: boolean } };
      const armed = host.__e2eBfcache;
      if (armed === undefined || frozen || navigate.destination.sameDocument) return;
      event.preventDefault();
      if (armed.pagehide) {
        window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      }
      const session: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)!;
        session[key] = sessionStorage.getItem(key)!;
      }
      freeze();
      host.__e2eLeftPage(navigate.destination.url, session);
    });
  });

  return {
    async arm(page, { pagehide = true } = {}) {
      await page.evaluate(
        (armed) => {
          (window as unknown as { __e2eBfcache: { pagehide: boolean } }).__e2eBfcache = armed;
        },
        { pagehide },
      );
    },
    async next() {
      const entry = left.shift() ?? (await new Promise<Left>((resolve) => waiting.push(resolve)));
      const page = await context.newPage();
      const appOrigin = new URL(entry.url).origin;
      await page.addInitScript(
        ({ session, seededKey }) => {
          if (sessionStorage.getItem(seededKey) !== null) return;
          for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, value);
          sessionStorage.setItem(seededKey, "1");
        },
        { session: entry.session, seededKey: `e2e.bfcache-seeded:${appOrigin}` },
      );
      await page.goto(entry.url);
      return page;
    },
  };
}

/**
 * Whether expo-sqlite's files are free: a worker of `probe` (a non-app page of the origin)
 * takes and closes a sync access handle on each, retrying for up to `withinMs` (a released
 * handle may take a moment). "free", or the error name of the last attempt.
 */
export async function databaseFilesState(probe: Page, withinMs = 5_000): Promise<string> {
  return probe.evaluate(async (deadlineMs) => {
    const source = `
      self.onmessage = async () => {
        try {
          const root = await navigator.storage.getDirectory();
          const directory = await root.getDirectoryHandle("expo-sqlite");
          for await (const [, handle] of directory) {
            if (handle.kind === "file") (await handle.createSyncAccessHandle()).close();
          }
          self.postMessage("free");
        } catch (error) {
          self.postMessage(error.name);
        }
      };`;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const started = Date.now();
    for (;;) {
      const worker = new Worker(url);
      const result = await new Promise<string>((resolve) => {
        worker.onmessage = ({ data }) => resolve(String(data));
        worker.postMessage("go");
      });
      worker.terminate();
      if (result === "free" || Date.now() - started > deadlineMs) return result;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }, withinMs);
}
