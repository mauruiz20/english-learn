import {
  createCallbackStash,
  handOffCallback,
  isDatabaseFreePath,
  watchCallbackHandOff,
  type RelayChannel,
  type RelayMessage,
} from "./callback-relay";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    map,
  };
}

/** A BroadcastChannel between two pages ("callback" and "app"). */
function createBus() {
  const listeners = new Map<string, Set<(message: RelayMessage) => void>>();
  const channelFor = (page: string): RelayChannel => ({
    post(message) {
      for (const [other, set] of listeners) {
        if (other !== page) for (const listener of set) queueMicrotask(() => listener(message));
      }
    },
    subscribe(listener) {
      const set = listeners.get(page) ?? new Set();
      set.add(listener);
      listeners.set(page, set);
      return () => void set.delete(listener);
    },
  });
  return { channelFor };
}

const FRAGMENT = "#id_token=a.b.c&state=s1";

describe("the callback stash", () => {
  it("keeps the fragment once, for its state, while fresh", () => {
    let now = 0;
    const stash = createCallbackStash(memoryStorage(), () => now);
    expect(stash.put(FRAGMENT)).toBe("s1");
    expect(stash.peekState()).toBe("s1");
    expect(stash.take()).toBe(FRAGMENT);
    expect(stash.take()).toBeNull();

    stash.put(FRAGMENT);
    now = 11 * 60_000;
    expect(stash.peekState()).toBeNull();
    expect(stash.take()).toBeNull();
  });

  it("refuses a fragment without state", () => {
    const storage = memoryStorage();
    expect(createCallbackStash(storage).put("#id_token=x")).toBeNull();
    expect(storage.map.size).toBe(0);
  });
});

describe("handing the callback over", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("the app window that started the sign-in takes it (the callback page boots nothing)", async () => {
    const bus = createBus();
    const storage = memoryStorage();
    const onHandOff = jest.fn();
    watchCallbackHandOff({
      stash: createCallbackStash(storage),
      channel: bus.channelFor("app"),
      ownsState: (state) => state === "s1",
      onHandOff,
      onVisible: () => () => {},
    });

    const result = handOffCallback({
      fragment: FRAGMENT,
      stash: createCallbackStash(storage),
      channel: bus.channelFor("callback"),
    });
    await jest.advanceTimersByTimeAsync(0);

    await expect(result).resolves.toBe("taken");
    expect(onHandOff).toHaveBeenCalledTimes(1);
  });

  it("another app window, which did not start this sign-in, leaves it alone", async () => {
    const bus = createBus();
    const storage = memoryStorage();
    const onHandOff = jest.fn();
    watchCallbackHandOff({
      stash: createCallbackStash(storage),
      channel: bus.channelFor("app"),
      ownsState: () => false,
      onHandOff,
      onVisible: () => () => {},
    });

    const result = handOffCallback({
      fragment: FRAGMENT,
      stash: createCallbackStash(storage),
      channel: bus.channelFor("callback"),
    });
    await jest.advanceTimersByTimeAsync(1500);

    await expect(result).resolves.toBe("here");
    expect(onHandOff).not.toHaveBeenCalled();
  });

  it("nobody answers (same-tab redirect): continue in this tab", async () => {
    const result = handOffCallback({
      fragment: FRAGMENT,
      stash: createCallbackStash(memoryStorage()),
      channel: createBus().channelFor("callback"),
    });
    await jest.advanceTimersByTimeAsync(1500);
    await expect(result).resolves.toBe("here");
  });

  it("a suspended app window picks the sign-in up when it comes back to the foreground", () => {
    const storage = memoryStorage();
    createCallbackStash(storage).put(FRAGMENT);
    let visible: () => void = () => {};
    const onHandOff = jest.fn();
    watchCallbackHandOff({
      stash: createCallbackStash(storage),
      channel: null,
      ownsState: (state) => state === "s1",
      onHandOff,
      onVisible: (listener) => {
        visible = listener;
        return () => {};
      },
    });

    visible();
    expect(onHandOff).toHaveBeenCalledTimes(1);
  });
});

describe("isDatabaseFreePath", () => {
  it("only the Google callback runs without the database", () => {
    expect(isDatabaseFreePath("/auth/callback")).toBe(true);
    expect(isDatabaseFreePath("/auth/callback/")).toBe(true);
    expect(isDatabaseFreePath("/auth/completar")).toBe(false);
    expect(isDatabaseFreePath("/")).toBe(false);
  });
});
