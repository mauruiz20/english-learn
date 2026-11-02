import {
  createDatabaseOwnership,
  type LockAttempt,
  type OwnershipMessage,
  type OwnershipPorts,
  type OwnershipState,
} from "./database-ownership";

/** A BroadcastChannel between pages: a message reaches every OTHER page, asynchronously. */
function createBus() {
  const listeners = new Set<{ pageId: string; listener: (message: OwnershipMessage) => void }>();
  /** Pages whose channel is dead (frozen, suspended): they neither send nor receive. */
  const muted = new Set<string>();
  return {
    mute(pageId: string) {
      muted.add(pageId);
    },
    channelFor(pageId: string) {
      return {
        post(message: OwnershipMessage) {
          if (muted.has(pageId)) return;
          for (const entry of listeners) {
            if (entry.pageId !== pageId && !muted.has(entry.pageId)) {
              queueMicrotask(() => entry.listener(message));
            }
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
  let failure: string | null = null;
  let queryable = true;
  let phantomLock = false;
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
    /** Every request rejects with `name` (a broken Web Locks implementation). */
    failWith(name: string) {
      failure = name;
    },
    withoutQuery() {
      queryable = false;
    },
    phantom() {
      phantomLock = true;
    },
    unload(pageId: string) {
      if (holder === pageId) {
        holder = null;
        grantNext();
      }
    },
    locksFor(pageId: string) {
      return {
        async tryAcquire(): Promise<LockAttempt> {
          if (failure !== null) return { error: failure };
          if (holder !== null || phantomLock) return "unavailable";
          holder = pageId;
          return "acquired";
        },
        acquire(timeoutMs: number): Promise<LockAttempt> {
          if (failure !== null) return Promise.resolve({ error: failure });
          if (phantomLock) {
            return new Promise((resolve) => setTimeout(() => resolve("unavailable"), timeoutMs));
          }
          if (holder === null) {
            holder = pageId;
            return Promise.resolve("acquired");
          }
          return new Promise<LockAttempt>((resolve) => {
            const waiter = { pageId, grant: () => resolve("acquired") };
            waiters.push(waiter);
            setTimeout(() => {
              const index = waiters.indexOf(waiter);
              if (index >= 0) {
                waiters.splice(index, 1);
                resolve("unavailable");
              }
            }, timeoutMs);
          });
        },
        async holders() {
          if (!queryable) return null;
          return holder === null ? 0 : 1;
        },
      };
    },
  };
}

type World = ReturnType<typeof createWorld>;

function createPage(pageId: string, world: World) {
  const reload = jest.fn();
  const ports: OwnershipPorts = {
    pageId,
    channel: world.bus.channelFor(pageId),
    locks: world.locks?.locksFor(pageId) ?? null,
    releasedFlag: {
      consume: () => world.flags.delete(pageId),
      set: () => void world.flags.add(pageId),
    },
    // sessionStorage: per tab, survives this tab's reloads.
    takeOverAttempts: {
      count: () => world.attempts.get(pageId) ?? 0,
      increment: () => void world.attempts.set(pageId, (world.attempts.get(pageId) ?? 0) + 1),
      clear: () => void world.attempts.delete(pageId),
    },
    now: () => Date.now(),
    environment: () => ({
      webLocks: world.locks !== null,
      broadcastChannel: true,
      opfs: true,
      displayMode: "standalone",
    }),
    reload,
  };
  return { ownership: createDatabaseOwnership(ports), reload, pageId };
}

function createWorld({ withLocks = true }: { withLocks?: boolean } = {}) {
  const world = {
    bus: createBus(),
    locks: withLocks ? createLocks() : null,
    flags: new Set<string>(),
    attempts: new Map<string, number>(),
    page: (id: string) => createPage(id, world as World),
  };
  return world;
}

/** Resolves `promise` while advancing fake timers. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  let value: T | undefined;
  void promise.then((v) => {
    done = true;
    value = v;
  });
  for (let i = 0; i < 400 && !done; i++) await jest.advanceTimersByTimeAsync(100);
  if (!done) throw new Error("did not settle");
  return value as T;
}

const kind = (state: OwnershipState) => state.kind;
const reason = (state: OwnershipState) => state.diagnostics.reason;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("database ownership between tabs", () => {
  it("the first page owns the database right away", async () => {
    const world = createWorld();
    const state = await settle(world.page("a").ownership.start());
    expect(kind(state)).toBe("owned");
    expect(world.locks?.holder).toBe("a");
  });

  it("a second page learns that another tab owns the database (the owner answered)", async () => {
    const world = createWorld();
    const a = world.page("a");
    await settle(a.ownership.start());
    a.ownership.serve(async () => {});

    const state = await settle(world.page("b").ownership.start());
    expect(kind(state)).toBe("open-elsewhere");
    expect(reason(state)).toBe("owner-answered");
  });

  it("a reload waits for the previous page to let go instead of showing the screen", async () => {
    const world = createWorld();
    const before = world.page("before-reload");
    await settle(before.ownership.start());
    // The reloaded page starts while the old one is still unloading (no one answers).
    const after = world.page("after-reload").ownership.start();
    setTimeout(() => world.locks?.unload("before-reload"), 700);

    expect(kind(await settle(after))).toBe("owned");
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

    expect(kind(await settle(b.ownership.takeOver()))).toBe("owned");

    expect(order).toEqual(["drained", "reloaded"]);
    expect(world.locks?.holder).toBe("b");
    // After its reload, the released page shows "La app se abrió en otra pestaña".
    expect(kind(await settle(world.page("a").ownership.start()))).toBe("released");
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
    expect(kind(await settle(reloadedA.ownership.takeOver()))).toBe("owned");
    expect(b.reload).toHaveBeenCalledTimes(1);
    expect(world.locks?.holder).toBe("a");
  });

  it("the released flag is used once: a later reload claims the database normally", async () => {
    const world = createWorld();
    world.flags.add("a");
    expect(kind(await settle(world.page("a").ownership.start()))).toBe("released");
    expect(kind(await settle(world.page("a").ownership.start()))).toBe("owned");
  });

  it("works without Web Locks (channel only)", async () => {
    const world = createWorld({ withLocks: false });
    const a = world.page("a");
    const first = await settle(a.ownership.start());
    expect(kind(first)).toBe("owned");
    expect(reason(first)).toBe("no-locks");
    a.ownership.serve(async () => {});
    a.reload.mockImplementation(() => {});
    const b = world.page("b");
    expect(kind(await settle(b.ownership.start()))).toBe("open-elsewhere");
    expect(kind(await settle(b.ownership.takeOver()))).toBe("owned");
    expect(a.reload).toHaveBeenCalledTimes(1);
  });

  it("stops answering once it is no longer serving", async () => {
    const world = createWorld();
    const a = world.page("a");
    await settle(a.ownership.start());
    const stop = a.ownership.serve(async () => {});
    stop();
    world.locks?.unload("a");

    expect(kind(await settle(world.page("b").ownership.start()))).toBe("owned");
  });
});

describe("only positive evidence claims another tab (iOS false positives)", () => {
  it("never touches the database files: the lock alone decides (iOS self-collisions)", async () => {
    const world = createWorld();

    const state = await settle(world.page("a").ownership.start());

    expect(kind(state)).toBe("owned");
    expect(reason(state)).toBe("lock-acquired");
    expect(state.diagnostics).not.toHaveProperty("probeError");
  });

  it("a Web Locks request that fails is not another tab: opens normally", async () => {
    const world = createWorld();
    world.locks?.failWith("InvalidStateError");

    const state = await settle(world.page("a").ownership.start());

    expect(kind(state)).toBe("owned");
    expect(reason(state)).toBe("lock-error:InvalidStateError");
  });

  it("a lock nobody holds per navigator.locks.query is not another tab", async () => {
    const world = createWorld();
    // Requests are never granted, yet the query shows no holder (a broken implementation).
    world.locks?.phantom();

    const state = await settle(world.page("a").ownership.start());

    expect(kind(state)).toBe("owned");
    expect(reason(state)).toBe("no-owner-answer");
    expect(state.diagnostics.lockHolders).toBe(0);
  });
});

describe("a holder that never answers ('Usar aquí' must not loop)", () => {
  function frozenOwner() {
    const world = createWorld();
    const a = world.page("a");
    return { world, a };
  }

  it("first shows 'open elsewhere' (a lock holder exists), then the help screen", async () => {
    const { world, a } = frozenOwner();
    await settle(a.ownership.start());
    a.ownership.serve(async () => {});
    // Frozen or suspended: still holds the lock, never answers again.
    world.bus.mute("a");

    const b = world.page("b");
    const first = await settle(b.ownership.start());
    expect(kind(first)).toBe("open-elsewhere");
    expect(reason(first)).toBe("lock-held");
    expect(first.diagnostics.lockHolders).toBe(1);

    const afterUseHere = await settle(b.ownership.takeOver());
    expect(kind(afterUseHere)).toBe("stuck");
    expect(reason(afterUseHere)).toBe("no-owner-answer");
    expect(afterUseHere.diagnostics.takeOverAttempts).toBe(1);
    expect(a.reload).not.toHaveBeenCalled();
  });

  it("a reload after a failed 'Usar aquí' goes straight to the help screen (attempts survive)", async () => {
    const { world, a } = frozenOwner();
    await settle(a.ownership.start());
    world.bus.mute("a");
    const b = world.page("b");
    await settle(b.ownership.start());
    await settle(b.ownership.takeOver());

    const reloadedB = world.page("b");
    expect(kind(await settle(reloadedB.ownership.start()))).toBe("stuck");
  });

  it("'Reintentar' waits longer and gets the database once the holder goes away", async () => {
    const { world, a } = frozenOwner();
    await settle(a.ownership.start());
    world.bus.mute("a");
    const b = world.page("b");
    await settle(b.ownership.start());
    await settle(b.ownership.takeOver());

    // The learner closed the frozen app; it lets go 10 s into the longer wait.
    const retried = b.ownership.retry();
    setTimeout(() => world.locks?.unload("a"), 10_000);
    const state = await settle(retried);
    expect(kind(state)).toBe("owned");
    expect(world.attempts.get("b")).toBeUndefined();
  });

  it("'Reintentar' with the holder still there stays on the help screen", async () => {
    const { world, a } = frozenOwner();
    await settle(a.ownership.start());
    world.bus.mute("a");
    const b = world.page("b");
    await settle(b.ownership.start());
    await settle(b.ownership.takeOver());

    const state = await settle(b.ownership.retry());
    expect(kind(state)).toBe("stuck");
    expect(state.diagnostics.takeOverAttempts).toBe(2);
  });

  it("without navigator.locks.query a lock that never frees still counts as held", async () => {
    const { world, a } = frozenOwner();
    world.locks?.withoutQuery();
    await settle(a.ownership.start());
    world.bus.mute("a");

    const state = await settle(world.page("b").ownership.start());
    expect(kind(state)).toBe("open-elsewhere");
    expect(state.diagnostics.lockHolders).toBeNull();
  });
});

describe("diagnostics", () => {
  it("record the environment and when the check started and ended", async () => {
    jest.setSystemTime(new Date("2026-11-02T10:00:00Z"));
    const world = createWorld();
    const state = await settle(world.page("a").ownership.start());

    expect(state.diagnostics).toMatchObject({
      reason: "lock-acquired",
      environment: {
        webLocks: true,
        broadcastChannel: true,
        opfs: true,
        displayMode: "standalone",
      },
      startedAt: Date.parse("2026-11-02T10:00:00Z"),
    });
    expect(state.diagnostics.decidedAt).toBeGreaterThanOrEqual(state.diagnostics.startedAt);
  });
});
