import { CALLBACK_PATH, parseCallbackFragment } from "./oidc";

/**
 * Google's redirect lands on `/auth/callback` (the registered redirect URI). That page never
 * opens the database: it stashes the fragment and hands it to the app.
 *
 * Why: on iOS a Home Screen web app may load the callback in a second web view (out-of-scope
 * navigation to Google), and any page that opens expo-sqlite's OPFS database keeps the files
 * until it dies, locking the real app window out. So:
 * 1. The callback page stashes the fragment (localStorage, 10 minutes, read once) and asks on
 *    the `english-learn-auth` channel whether the app window that started the sign-in is alive.
 * 2. That window (it holds the matching pending sign-in in its sessionStorage) answers and
 *    completes the sign-in itself at `/auth/completar`; the callback page only says so.
 * 3. Nobody answers (the usual same-tab redirect): the callback page goes to `/auth/completar`,
 *    which boots the app and completes the sign-in there.
 * A suspended app window also picks the stash up when it comes back to the foreground.
 */
export const COMPLETE_PATH = "/auth/completar";

const STASH_KEY = "english-learn.auth-callback";
const STASH_TTL_MS = 10 * 60_000;
/** How long the callback page waits for the app window to answer. */
export const HAND_OFF_REPLY_MS = 1000;

export type RelayMessage =
  | { readonly type: "auth-result"; readonly state: string }
  | { readonly type: "auth-taken"; readonly state: string };

export type RelayChannel = {
  post(message: RelayMessage): void;
  subscribe(listener: (message: RelayMessage) => void): () => void;
};

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Pages that must never open the database (see above). */
export function isDatabaseFreePath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === CALLBACK_PATH;
}

export function createCallbackStash(storage: KeyValueStorage, now: () => number = Date.now) {
  const read = (): { fragment: string; state: string } | null => {
    try {
      const parsed = JSON.parse(storage.getItem(STASH_KEY) ?? "null") as {
        fragment?: unknown;
        state?: unknown;
        at?: unknown;
      } | null;
      if (
        typeof parsed?.fragment !== "string" ||
        typeof parsed.state !== "string" ||
        typeof parsed.at !== "number" ||
        now() - parsed.at > STASH_TTL_MS
      ) {
        return null;
      }
      return { fragment: parsed.fragment, state: parsed.state };
    } catch {
      return null;
    }
  };
  return {
    /** Keeps the fragment; returns its `state`, or null when it has none (nothing is kept). */
    put(fragment: string): string | null {
      const result = parseCallbackFragment(fragment);
      if (result.kind === "invalid") return null;
      try {
        storage.setItem(STASH_KEY, JSON.stringify({ fragment, state: result.state, at: now() }));
      } catch {
        return null;
      }
      return result.state;
    },
    peekState: (): string | null => read()?.state ?? null,
    /** The fragment, once. */
    take(): string | null {
      const stashed = read();
      try {
        storage.removeItem(STASH_KEY);
      } catch {
        // Nothing to forget.
      }
      return stashed?.fragment ?? null;
    },
  };
}

export type CallbackStash = ReturnType<typeof createCallbackStash>;

/** The callback page: "taken" when the app window took it, "here" to complete in this tab. */
export function handOffCallback({
  fragment,
  stash,
  channel,
  timeoutMs = HAND_OFF_REPLY_MS,
}: {
  fragment: string;
  stash: CallbackStash;
  channel: RelayChannel | null;
  timeoutMs?: number;
}): Promise<"taken" | "here"> {
  const state = stash.put(fragment);
  if (state === null || channel === null) return Promise.resolve("here");
  return new Promise((resolve) => {
    const unsubscribe = channel.subscribe((message) => {
      if (message.type !== "auth-taken" || message.state !== state) return;
      clearTimeout(timer);
      unsubscribe();
      resolve("taken");
    });
    const timer = setTimeout(() => {
      unsubscribe();
      resolve("here");
    }, timeoutMs);
    channel.post({ type: "auth-result", state });
  });
}

/**
 * The app window: takes a stashed callback for a sign-in IT started (`ownsState`), when the
 * callback page announces it or when the window comes back to the foreground.
 */
export function watchCallbackHandOff({
  stash,
  channel,
  ownsState,
  onHandOff,
  onVisible,
}: {
  stash: CallbackStash;
  channel: RelayChannel | null;
  ownsState: (state: string) => boolean;
  onHandOff: () => void;
  onVisible: (listener: () => void) => () => void;
}): () => void {
  const check = () => {
    const state = stash.peekState();
    if (state === null || !ownsState(state)) return;
    channel?.post({ type: "auth-taken", state });
    onHandOff();
  };
  const unsubscribe =
    channel?.subscribe((message) => {
      if (message.type === "auth-result") check();
    }) ?? (() => {});
  const stopVisible = onVisible(check);
  return () => {
    unsubscribe();
    stopVisible();
  };
}

const RELAY_TYPES = new Set(["auth-result", "auth-taken"]);

/** The `english-learn-auth` BroadcastChannel, or null where there is none. */
export function browserRelayChannel(): RelayChannel | null {
  const Channel = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  if (Channel === undefined) return null;
  const channel = new Channel("english-learn-auth");
  const listeners = new Set<(message: RelayMessage) => void>();
  channel.onmessage = ({ data }: MessageEvent) => {
    const message = data as RelayMessage | null;
    if (!RELAY_TYPES.has(String(message?.type)) || typeof message?.state !== "string") return;
    for (const listener of [...listeners]) listener(message);
  };
  return {
    post: (message) => channel.postMessage(message),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
