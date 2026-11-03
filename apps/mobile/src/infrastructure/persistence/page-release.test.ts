import {
  RELEASE_ACK_TIMEOUT_MS,
  RELEASE_DRAIN_TIMEOUT_MS,
  createPageRelease,
  watchPageLifecycle,
  type ReleasableWorker,
} from "./page-release";

type Listener = (event: { data: unknown }) => void;

/** expo-sqlite's worker as patched: answers `releaseAccessHandles` (or stays silent). */
class FakeWorker implements ReleasableWorker {
  readonly log: string[];
  private readonly listeners = new Set<Listener>();
  constructor(
    log: string[],
    private readonly answers: boolean = true,
  ) {
    this.log = log;
  }
  postMessage(message: unknown) {
    const { type, requestId } = message as { type: string; requestId: string };
    this.log.push(`post:${type}`);
    if (this.answers) {
      queueMicrotask(() => {
        this.log.push("handles-closed");
        for (const listener of [...this.listeners]) {
          listener({ data: { type: "accessHandlesReleased", requestId, error: null } });
        }
      });
    }
  }
  addEventListener(_type: "message", listener: Listener) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: "message", listener: Listener) {
    this.listeners.delete(listener);
  }
  terminate() {
    this.log.push("terminate");
  }
}

function setup({ answers = true, drain }: { answers?: boolean; drain?: () => Promise<void> } = {}) {
  const log: string[] = [];
  const worker = new FakeWorker(log, answers);
  const release = createPageRelease({
    workers: () => [worker],
    letGoOfLock: () => log.push("lock"),
  });
  if (drain !== undefined) release.setDrain(drain);
  return { log, worker, release };
}

afterEach(() => jest.useRealTimers());

describe("createPageRelease", () => {
  it("finishes the writes, then closes the worker's file handles, then ends it, then lets go of the lock", async () => {
    const { log, release } = setup({
      drain: async () => {
        log.push("drained");
      },
    });

    await release.release();

    expect(log).toEqual([
      "drained",
      "post:releaseAccessHandles",
      "handles-closed",
      "terminate",
      "lock",
    ]);
    expect(release.released()).toBe(true);
  });

  it("navigates only once everything was let go", async () => {
    const { log, release } = setup();

    await release.leave(() => log.push("navigate"));

    expect(log.at(-1)).toBe("navigate");
    expect(log).toContain("handles-closed");
  });

  it("runs once: leaving twice releases once and navigates each time", async () => {
    const { log, release } = setup();

    await Promise.all([
      release.leave(() => log.push("navigate")),
      release.leave(() => log.push("navigate")),
    ]);

    expect(log.filter((entry) => entry === "post:releaseAccessHandles")).toHaveLength(1);
    expect(log.filter((entry) => entry === "navigate")).toHaveLength(2);
  });

  it("never hangs: a worker that does not answer is ended after a short wait", async () => {
    jest.useFakeTimers();
    const { log, release } = setup({ answers: false });
    let navigated = false;

    const leaving = release.leave(() => {
      navigated = true;
    });
    await jest.advanceTimersByTimeAsync(RELEASE_ACK_TIMEOUT_MS - 1);
    expect(navigated).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await leaving;

    expect(navigated).toBe(true);
    expect(log).toEqual(["post:releaseAccessHandles", "terminate", "lock"]);
  });

  it("never hangs on writes either: a drain that does not finish is cut after a short wait", async () => {
    jest.useFakeTimers();
    const { log, release } = setup({ drain: () => new Promise(() => {}) });

    const leaving = release.release();
    await jest.advanceTimersByTimeAsync(RELEASE_DRAIN_TIMEOUT_MS);
    await leaving;

    expect(log).toContain("terminate");
  });

  it("a failed drain still releases", async () => {
    const { log, release } = setup({ drain: () => Promise.reject(new Error("write failed")) });
    jest.spyOn(console, "warn").mockImplementation(() => {});

    await release.release();

    expect(log).toContain("terminate");
  });

  it("without workers (nothing opened, native) just lets go of the lock", async () => {
    const log: string[] = [];
    const release = createPageRelease({ workers: () => [], letGoOfLock: () => log.push("lock") });

    await release.leave(() => log.push("navigate"));

    expect(log).toEqual(["lock", "navigate"]);
  });

  it("releaseNow (pagehide, which cannot wait) ends the workers at once", () => {
    const { log, release } = setup();

    release.releaseNow();

    expect(log).toEqual(["terminate", "lock"]);
    expect(release.released()).toBe(true);
  });

  it("ignores answers meant for another request", async () => {
    jest.useFakeTimers();
    const log: string[] = [];
    const listeners = new Set<Listener>();
    const worker: ReleasableWorker = {
      postMessage: () => {
        for (const listener of listeners) {
          listener({ data: { type: "accessHandlesReleased", requestId: "someone-else" } });
          listener({ data: { id: 3, result: null } });
        }
      },
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
      terminate: () => log.push("terminate"),
    };
    const release = createPageRelease({ workers: () => [worker], letGoOfLock: () => {} });

    const releasing = release.release();
    await jest.advanceTimersByTimeAsync(RELEASE_ACK_TIMEOUT_MS - 1);
    expect(log).toEqual([]);
    await jest.advanceTimersByTimeAsync(1);
    await releasing;
    expect(log).toEqual(["terminate"]);
  });
});

describe("watchPageLifecycle", () => {
  function lifecycle() {
    const target = new EventTarget();
    const log: string[] = [];
    const release = {
      releaseNow: () => log.push("releaseNow"),
      released: () => log.includes("releaseNow"),
    };
    const stop = watchPageLifecycle({ target, release, reload: () => log.push("reload") });
    const fire = (type: string, persisted: boolean) => {
      const event = new Event(type) as Event & { persisted: boolean };
      Object.defineProperty(event, "persisted", { value: persisted });
      target.dispatchEvent(event);
    };
    return { log, fire, stop };
  }

  it("pagehide lets go of the files at once (the page may be kept frozen)", () => {
    const { log, fire } = lifecycle();

    fire("pagehide", true);

    expect(log).toEqual(["releaseNow"]);
  });

  it("a page restored from the back/forward cache after letting go reloads to open again", () => {
    const { log, fire } = lifecycle();

    fire("pagehide", true);
    fire("pageshow", true);

    expect(log).toEqual(["releaseNow", "reload"]);
  });

  it("a first load (pageshow not persisted) or a page that kept its database does not reload", () => {
    const { log, fire } = lifecycle();

    fire("pageshow", false);
    fire("pageshow", true);

    expect(log).toEqual([]);
  });

  it("stops listening", () => {
    const { log, fire, stop } = lifecycle();

    stop();
    fire("pagehide", true);

    expect(log).toEqual([]);
  });
});
