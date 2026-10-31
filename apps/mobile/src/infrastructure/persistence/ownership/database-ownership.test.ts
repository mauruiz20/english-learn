import {
  createDatabaseOwnership,
  type OwnershipMessage,
  type OwnershipPorts,
} from "./database-ownership";
import type { ProbeResult } from "./retry-while-busy";

/** A BroadcastChannel between pages: a message reaches every OTHER page, asynchronously. */
function createBus() {
  const listeners = new Set<{ pageId: string; listener: (message: OwnershipMessage) => void }>();
  return {
    channelFor(pageId: string) {
      return {
        post(message: OwnershipMessage) {
          for (const entry of listeners) {
            if (entry.pageId !== pageId) queueMicrotask(() => entry.listener(message));
          }
        },
        subscribe(listener: (message: OwnershipMessage) => void) {
          const entry = { pageId, listener };
          listeners.add(entry);
          return () => void listeners.delete(entry);
        },
      };
    },
  };
}

/** One exclusive Web Lock shared by the pages; `unload(page)` releases it like closing a tab. */
function createLocks() {
  let holder: string | null = null;
  const waiters: { pageId: string; grant: () => void }[] = [];
  const grantNext = () => {
    const next = waiters.shift();
    if (next !== undefined) {
      holder = next.pageId;
      next.grant();
    }
  };
  return {
    get holder() {
      return holder;
    },
    unload(pageId: string) {
      if (holder === pageId) {
        holder = null;
        grantNext();
      }
    },
    locksFor(pageId: string) {
      return {
        async tryAcquire() {
          if (holder !== null) return false;
          holder = pageId;
          return true;
        },
        acquire(timeoutMs: number) {
          if (holder === null) {
            holder = pageId;
            return Promise.resolve(true);
          }
          return new Promise<boolean>((resolve) => {
            const waiter = { pageId, grant: () => resolve(true) };
            waiters.push(waiter);
            setTimeout(() => {
              const index = waiters.indexOf(waiter);
              if (index >= 0) {
                waiters.splice(index, 1);
                resolve(false);
              }
            }, timeoutMs);
          });
        },
      };
    },
  };
}

function createPage(
  pageId: string,
  world: {
    bus: ReturnType<typeof createBus>;
    locks: ReturnType<typeof createLocks> | null;
    probe: () => Promise<ProbeResult>;
    flags: Set<string>;
  },
) {
  const reload = jest.fn();
  const ports: OwnershipPorts = {
    pageId,
    channel: world.bus.channelFor(pageId),
    locks: world.locks?.locksFor(pageId) ?? null,
    probe: world.probe,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    releasedFlag: {
      consume: () => world.flags.delete(pageId),
      set: () => void world.flags.add(pageId),
    },
    reload,
  };
  return { ownership: createDatabaseOwnership(ports), reload, pageId };
}

function createWorld({ withLocks = true }: { withLocks?: boolean } = {}) {
  const world = {
    bus: createBus(),
    locks: withLocks ? createLocks() : null,
    probeResults: [] as ProbeResult[],
    probe: async (): Promise<ProbeResult> => world.probeResults.shift() ?? "free",
    flags: new Set<string>(),
  };
  return { ...world, page: (id: string) => createPage(id, world) };
}

/** Resolves `promise` while advancing fake timers. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  let value: T | undefined;
  void promise.then((v) => {
    done = true;
    value = v;
  });
  for (let i = 0; i < 200 && !done; i++) await jest.advanceTimersByTimeAsync(100);
  if (!done) throw new Error("did not settle");
  return value as T;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("database ownership between tabs", () => {
  it("the first page owns the database right away", async () => {
    const world = createWorld();
    await expect(settle(world.page("a").ownership.start())).resolves.toBe("owned");
    expect(world.locks?.holder).toBe("a");
  });

  it("a second page learns that another tab owns the database", async () => {
    const world = createWorld();
    const a = world.page("a");
    await settle(a.ownership.start());
    a.ownership.serve(async () => {});

    await expect(settle(world.page("b").ownership.start())).resolves.toBe("open-elsewhere");
  });

  it("a reload waits for the previous page to let go instead of showing the screen", async () => {
    const world = createWorld();
    const before = world.page("before-reload");
    await settle(before.ownership.start());
    // The reloaded page starts while the old one is still unloading (no one answers).
    const after = world.page("after-reload").ownership.start();
    setTimeout(() => world.locks?.unload("before-reload"), 700);
    // Its SQLite worker lets go of the files a moment after the lock.
    world.probeResults.push("busy", "busy", "free");

    await expect(settle(after)).resolves.toBe("owned");
    expect(world.locks?.holder).toBe("after-reload");
  });

  it("'Usar aquí' asks the owner to release, and the owner drains its writes first", async () => {
    const world = createWorld();
    const a = world.page("a");
    await settle(a.ownership.start());
    const order: string[] = [];
    a.ownership.serve(async () => {
      order.push("drained");
    });
    a.reload.mockImplementation(() => {
      order.push("reloaded");
      world.locks?.unload("a");
    });
    const b = world.page("b");
    await settle(b.ownership.start());

    await expect(settle(b.ownership.takeOver())).resolves.toBe("owned");

    expect(order).toEqual(["drained", "reloaded"]);
    expect(world.locks?.holder).toBe("b");
    // After its reload, the released page shows "La app se abrió en otra pestaña".
    const reloaded = world.page("a");
    await expect(settle(reloaded.ownership.start())).resolves.toBe("released");
  });

  it("the released page can take the database back", async () => {
    const world = createWorld();
    const a = world.page("a");
    await settle(a.ownership.start());
    a.ownership.serve(async () => {});
    a.reload.mockImplementation(() => world.locks?.unload("a"));
    const b = world.page("b");
    await settle(b.ownership.start());
    await settle(b.ownership.takeOver());
    b.ownership.serve(async () => {});
    b.reload.mockImplementation(() => world.locks?.unload("b"));

    const reloadedA = world.page("a");
    await settle(reloadedA.ownership.start());
    await expect(settle(reloadedA.ownership.takeOver())).resolves.toBe("owned");
    expect(b.reload).toHaveBeenCalledTimes(1);
    expect(world.locks?.holder).toBe("a");
  });

  it("the released flag is used once: a later reload claims the database normally", async () => {
    const world = createWorld();
    world.flags.add("a");
    await expect(settle(world.page("a").ownership.start())).resolves.toBe("released");
    await expect(settle(world.page("a").ownership.start())).resolves.toBe("owned");
  });

  it("answers 'open elsewhere' when the files stay busy after every retry", async () => {
    const world = createWorld();
    world.probeResults.push(...Array<ProbeResult>(7).fill("busy"));
    await expect(settle(world.page("a").ownership.start())).resolves.toBe("open-elsewhere");
  });

  it("lets genuine failures through to the normal open and its error message", async () => {
    const world = createWorld();
    world.probeResults.push("error");
    await expect(settle(world.page("a").ownership.start())).resolves.toBe("owned");
  });

  it("taking over twice from the same page does not wait for its own lock", async () => {
    const world = createWorld();
    world.probeResults.push(...Array<ProbeResult>(7).fill("busy"));
    const a = world.page("a");
    await expect(settle(a.ownership.start())).resolves.toBe("open-elsewhere");
    await expect(settle(a.ownership.takeOver())).resolves.toBe("owned");
  });

  it("works without Web Locks (channel and probe only)", async () => {
    const world = createWorld({ withLocks: false });
    const a = world.page("a");
    await expect(settle(a.ownership.start())).resolves.toBe("owned");
    a.ownership.serve(async () => {});
    a.reload.mockImplementation(() => {});
    const b = world.page("b");
    await expect(settle(b.ownership.start())).resolves.toBe("open-elsewhere");
    await expect(settle(b.ownership.takeOver())).resolves.toBe("owned");
    expect(a.reload).toHaveBeenCalledTimes(1);
  });

  it("stops answering once it is no longer serving", async () => {
    const world = createWorld();
    const a = world.page("a");
    await settle(a.ownership.start());
    const stop = a.ownership.serve(async () => {});
    stop();
    world.locks?.unload("a");

    await expect(settle(world.page("b").ownership.start())).resolves.toBe("owned");
  });
});
