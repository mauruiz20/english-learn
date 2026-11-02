import {
  createOpenRetry,
  decideOpenRetry,
  formatWait,
  OPEN_RETRY_DELAYS_MS,
  OPEN_RETRY_WINDOW_MS,
} from "./open-retry";

const BUSY = new Error("The object is in an invalid state.");

describe("decideOpenRetry", () => {
  it("retries a busy open with growing delays while this page has a single database worker", () => {
    const delays = OPEN_RETRY_DELAYS_MS.map((_, attempts) =>
      decideOpenRetry({ error: BUSY, attempts, workersCreated: 1, storageWorks: true }),
    );

    expect(delays).toEqual(OPEN_RETRY_DELAYS_MS.map((delayMs) => ({ retry: true, delayMs })));
    expect([...OPEN_RETRY_DELAYS_MS]).toEqual([...OPEN_RETRY_DELAYS_MS].sort((a, b) => a - b));
  });

  it("keeps a busy open waiting for about 15 to 20 s before the error shows", () => {
    const total = OPEN_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0);
    expect(OPEN_RETRY_WINDOW_MS).toBe(total);
    expect(total).toBeGreaterThanOrEqual(15_000);
    expect(total).toBeLessThanOrEqual(20_000);
    // Files held for about 8 s are covered with room to spare (each reload also takes a while).
    let elapsed = 0;
    const covered = OPEN_RETRY_DELAYS_MS.some((ms) => (elapsed += ms) >= 8_000);
    expect(covered).toBe(true);
  });

  it("stops once the retries are used up", () => {
    expect(
      decideOpenRetry({
        error: BUSY,
        attempts: OPEN_RETRY_DELAYS_MS.length,
        workersCreated: 1,
        storageWorks: true,
      }),
    ).toEqual({ retry: false, why: "exhausted" });
  });

  it("never masks this page's own collision (a second database worker)", () => {
    expect(
      decideOpenRetry({ error: BUSY, attempts: 0, workersCreated: 2, storageWorks: true }),
    ).toEqual({ retry: false, why: "own-collision" });
  });

  it("never retries other failures (private mode, corrupt file, newer schema)", () => {
    expect(
      decideOpenRetry({
        error: new Error("UnknownError: The operation failed"),
        attempts: 0,
        workersCreated: 1,
        storageWorks: true,
      }),
    ).toEqual({ retry: false, why: "not-busy" });
  });

  it("never retries without a working attempt counter (it could loop forever)", () => {
    expect(
      decideOpenRetry({ error: BUSY, attempts: 0, workersCreated: 1, storageWorks: false }),
    ).toEqual({ retry: false, why: "no-storage" });
  });
});

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("createOpenRetry (web)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("reloads after the delay and counts the attempt across the reload", async () => {
    const storage = fakeStorage();
    const reload = jest.fn();
    const retry = createOpenRetry({ storage, reload, workersCreated: () => 1 });

    expect(retry.onFailure(BUSY)).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(OPEN_RETRY_DELAYS_MS[0]!);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(retry.attempts()).toBe(1);

    // The reloaded page fails again: the next, longer delay.
    const reloaded = createOpenRetry({ storage, reload, workersCreated: () => 1 });
    expect(reloaded.onFailure(BUSY)).toBe(true);
    await jest.advanceTimersByTimeAsync(OPEN_RETRY_DELAYS_MS[1]! - 1);
    expect(reload).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("shows the error once the retries are used up, and starts over after an open", () => {
    const storage = fakeStorage();
    const reload = jest.fn();
    for (let i = 0; i < OPEN_RETRY_DELAYS_MS.length; i++) {
      expect(createOpenRetry({ storage, reload, workersCreated: () => 1 }).onFailure(BUSY)).toBe(
        true,
      );
    }
    const last = createOpenRetry({ storage, reload, workersCreated: () => 1 });
    expect(last.onFailure(BUSY)).toBe(false);
    expect(last.attempts()).toBe(OPEN_RETRY_DELAYS_MS.length);

    last.onOpened();
    expect(last.attempts()).toBe(0);
  });

  it("'Reintentar' gives the learner a fresh round of retries", () => {
    const storage = fakeStorage();
    const retry = createOpenRetry({ storage, reload: jest.fn(), workersCreated: () => 1 });
    retry.onFailure(BUSY);
    retry.clear();
    expect(retry.attempts()).toBe(0);
    expect(retry.waitedMs()).toBeNull();
  });

  it("measures the total wait since the first busy open, across the reloads", () => {
    const storage = fakeStorage();
    let now = 1_000;
    const make = () =>
      createOpenRetry({ storage, reload: jest.fn(), workersCreated: () => 1, now: () => now });
    expect(make().waitedMs()).toBeNull();

    make().onFailure(BUSY);
    now += 400;
    make().onFailure(BUSY);
    now += 1_100;
    expect(make().waitedMs()).toBe(1_500);

    const opened = make();
    opened.onOpened();
    expect(opened.waitedMs()).toBeNull();
  });

  it("once the window is used up, offers to retry in the background without a fresh round", () => {
    const storage = fakeStorage();
    const reload = jest.fn();
    const make = () => createOpenRetry({ storage, reload, workersCreated: () => 1 });
    for (let i = 0; i < OPEN_RETRY_DELAYS_MS.length; i++) {
      const page = make();
      page.onFailure(BUSY);
      expect(page.retriesInBackground()).toBe(false);
    }
    const last = make();
    expect(last.onFailure(BUSY)).toBe(false);
    expect(last.retriesInBackground()).toBe(true);

    last.retryInBackground();
    last.retryInBackground();
    // One reload (the page goes away), and the count is kept: the next page shows the error
    // at once and keeps retrying in the background instead of a second 15 s window.
    expect(reload).toHaveBeenCalledTimes(1);
    expect(last.attempts()).toBe(OPEN_RETRY_DELAYS_MS.length);
  });

  it("never retries in the background a failure the window would not retry either", () => {
    const storage = fakeStorage();
    const twoWorkers = createOpenRetry({ storage, reload: jest.fn(), workersCreated: () => 2 });
    twoWorkers.onFailure(BUSY);
    expect(twoWorkers.retriesInBackground()).toBe(false);

    const other = createOpenRetry({ storage, reload: jest.fn(), workersCreated: () => 1 });
    other.onFailure(new Error("database disk image is malformed"));
    expect(other.retriesInBackground()).toBe(false);

    const noStorage = createOpenRetry({
      storage: undefined,
      reload: jest.fn(),
      workersCreated: () => 1,
    });
    noStorage.onFailure(BUSY);
    expect(noStorage.retriesInBackground()).toBe(false);
  });

  it("without session storage it shows the error instead of reloading", () => {
    const reload = jest.fn();
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    };
    expect(
      createOpenRetry({ storage: broken, reload, workersCreated: () => 1 }).onFailure(BUSY),
    ).toBe(false);
    expect(
      createOpenRetry({ storage: undefined, reload, workersCreated: () => 1 }).onFailure(BUSY),
    ).toBe(false);
  });
});

describe("formatWait", () => {
  it("shows seconds with one decimal for 'Detalles técnicos'", () => {
    expect(formatWait(16_240)).toBe("16,2 s");
    expect(formatWait(0)).toBe("0,0 s");
    expect(formatWait(null)).toBe("sin espera");
  });
});
