import { createOpenRetry, decideOpenRetry, OPEN_RETRY_DELAYS_MS } from "./open-retry";

const BUSY = new Error("The object is in an invalid state.");

describe("decideOpenRetry", () => {
  it("retries a busy open with growing delays while this page has a single database worker", () => {
    const delays = OPEN_RETRY_DELAYS_MS.map((_, attempts) =>
      decideOpenRetry({ error: BUSY, attempts, workersCreated: 1, storageWorks: true }),
    );

    expect(delays).toEqual(OPEN_RETRY_DELAYS_MS.map((delayMs) => ({ retry: true, delayMs })));
    expect([...OPEN_RETRY_DELAYS_MS]).toEqual([...OPEN_RETRY_DELAYS_MS].sort((a, b) => a - b));
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
