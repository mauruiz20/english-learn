import { ApiError, type SyncRequest, type SyncResponse } from "@english-learn/api-client";
import type { StoredEvent } from "@english-learn/domain";
import { createFakeSyncStore } from "@/testing/fake-sync-store";
import { createSyncEngine, takeBatch, type SyncEngineDeps } from "./sync-engine";

function event(n: number, payloadSize = 10): StoredEvent {
  return {
    id: `0190000${String(n).padStart(5, "0")}`,
    deviceId: "device-a",
    occurredAt: 1_000 + n,
    localDate: "2026-10-30",
    type: "item_reviewed",
    payload: { v: 1, pad: "x".repeat(payloadSize) },
  };
}

const page = (overrides: Partial<SyncResponse> = {}): SyncResponse => ({
  events: [],
  cursor: 0,
  hasMore: false,
  accepted: 0,
  duplicates: 0,
  conflicts: [],
  ...overrides,
});

type Answer = SyncResponse | Error | ((request: SyncRequest) => SyncResponse);

function setup(options: { local?: StoredEvent[]; answers?: Answer[]; online?: boolean } = {}) {
  const store = createFakeSyncStore({ local: options.local ?? [], deviceId: "device-a" });
  const requests: SyncRequest[] = [];
  const answers = [...(options.answers ?? [])];
  const sleeps: number[] = [];
  const deps: SyncEngineDeps = {
    api: {
      sync: jest.fn(async (request: SyncRequest) => {
        requests.push(structuredClone(request));
        const next = answers.shift() ?? page({ cursor: request.cursor ?? 0 });
        if (next instanceof Error) throw next;
        return typeof next === "function" ? next(request) : next;
      }),
    },
    store,
    refreshSession: jest.fn(async () => true),
    newDeviceId: () => "device-new",
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    isOnline: () => options.online ?? true,
  };
  return { engine: createSyncEngine(deps), deps, store, requests, sleeps };
}

const remote = (n: number): SyncResponse["events"][number] => ({
  ...event(n),
  deviceId: "device-b",
  payload: { v: 1, pad: "x" },
});

describe("takeBatch", () => {
  it("takes at most 500 events", () => {
    const events = Array.from({ length: 501 }, (_, i) => event(i));
    expect(takeBatch(events)).toHaveLength(500);
  });

  it("keeps the serialized batch under ~900 KB", () => {
    const events = Array.from({ length: 200 }, (_, i) => event(i, 8_000));
    const batch = takeBatch(events);

    expect(batch.length).toBeLessThan(200);
    expect(JSON.stringify(batch).length).toBeLessThanOrEqual(900_000);
  });
});

describe("createSyncEngine", () => {
  it("uploads the whole local history on a first sync, without device ids in events", async () => {
    const local = [event(1), event(2)];
    const { engine, requests, store } = setup({
      local,
      answers: [
        page({
          cursor: 2,
          accepted: 2,
          events: local.map((e) => ({ ...e, payload: e.payload as Record<string, unknown> })),
        }),
      ],
    });

    const outcome = await engine.run();

    expect(requests).toEqual([
      {
        deviceId: "device-a",
        cursor: null,
        events: local.map(({ deviceId: _, ...wire }) => wire),
      },
    ]);
    expect(store.unsynced()).toEqual([]);
    expect(await store.getSyncCursor()).toBe(2);
    expect(outcome).toEqual({ kind: "synced", changed: false, uploaded: 2, downloaded: 0 });
  });

  it("uploads in batches of 500 until nothing is left", async () => {
    const local = Array.from({ length: 1_200 }, (_, i) => event(i));
    const { engine, requests, store } = setup({ local });

    await engine.run();

    expect(requests.map((r) => r.events.length)).toEqual([500, 500, 200]);
    expect(store.unsynced()).toEqual([]);
  });

  it("pulls every page while the server has more, and reports the change", async () => {
    const { engine, requests, store } = setup({
      answers: [
        page({ events: [remote(10)], cursor: 10, hasMore: true }),
        page({ events: [remote(11)], cursor: 11 }),
      ],
    });

    const outcome = await engine.run();

    expect(requests.map((r) => r.cursor)).toEqual([null, 10]);
    expect(store.remoteIds()).toEqual([remote(10).id, remote(11).id]);
    expect(await store.getSyncCursor()).toBe(11);
    expect(outcome).toMatchObject({ kind: "synced", changed: true, downloaded: 2 });
  });

  it("starts from the stored cursor", async () => {
    const { engine, requests, store } = setup();
    await store.setSyncCursor(42);

    await engine.run();

    expect(requests[0]?.cursor).toBe(42);
  });

  it("backs off with jitter on network errors and 5xx, then succeeds", async () => {
    const { engine, sleeps, store } = setup({
      local: [event(1)],
      answers: [new TypeError("Failed to fetch"), new ApiError(503, "http_503", "down"), page()],
    });

    const outcome = await engine.run();

    expect(sleeps).toEqual([750, 1_500]); // 1 s, 2 s × (0.5 + 0.5 × 0.5)
    expect(outcome.kind).toBe("synced");
    expect(store.unsynced()).toEqual([]);
  });

  it("gives up after 5 attempts and keeps the events for the next sync", async () => {
    const failure = new ApiError(500, "http_500", "boom");
    const { engine, deps, store } = setup({
      local: [event(1)],
      answers: [failure, failure, failure, failure, failure],
    });

    const outcome = await engine.run();

    expect(deps.api.sync).toHaveBeenCalledTimes(5);
    expect(outcome).toEqual({ kind: "error", message: expect.any(String) });
    expect(store.unsynced()).toHaveLength(1);
  });

  it("waits Retry-After seconds on 429", async () => {
    const { engine, sleeps } = setup({
      answers: [new ApiError(429, "rate_limited", "slow down", 7), page()],
    });

    await engine.run();

    expect(sleeps).toEqual([7_000]);
  });

  it("refreshes the session once on 401 and retries", async () => {
    const { engine, deps } = setup({
      answers: [new ApiError(401, "invalid_token", "expired"), page()],
    });

    const outcome = await engine.run();

    expect(deps.refreshSession).toHaveBeenCalledTimes(1);
    expect(deps.api.sync).toHaveBeenCalledTimes(2);
    expect(outcome.kind).toBe("synced");
  });

  it("stops as signed out when the session cannot be refreshed", async () => {
    const { engine, deps } = setup({ answers: [new ApiError(401, "invalid_token", "expired")] });
    jest.mocked(deps.refreshSession).mockResolvedValue(false);

    expect(await engine.run()).toEqual({ kind: "signed-out" });
  });

  it("takes a new device id on 409 device_conflict and retries once", async () => {
    const { engine, requests, store } = setup({
      local: [event(1)],
      answers: [new ApiError(409, "device_conflict", "taken"), page()],
    });

    const outcome = await engine.run();

    expect(requests.map((r) => r.deviceId)).toEqual(["device-a", "device-new"]);
    expect(await store.getDeviceId()).toBe("device-new");
    expect(outcome.kind).toBe("synced");
  });

  it("does not loop on a second device conflict", async () => {
    const conflict = new ApiError(409, "device_conflict", "taken");
    const { engine } = setup({ answers: [conflict, conflict] });

    expect((await engine.run()).kind).toBe("error");
  });

  it("only logs conflicting events", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { engine } = setup({ local: [event(1)], answers: [page({ conflicts: [event(1).id] })] });

    expect((await engine.run()).kind).toBe("synced");
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/conflict/i), [event(1).id]);
    warn.mockRestore();
  });

  it("does not call the API while offline", async () => {
    const { engine, deps } = setup({ online: false, local: [event(1)] });

    expect(await engine.run()).toEqual({ kind: "offline" });
    expect(deps.api.sync).not.toHaveBeenCalled();
  });

  it("reports offline when the connection drops mid-sync", async () => {
    let online = true;
    const { engine, deps } = setup({ answers: [new TypeError("Failed to fetch")] });
    deps.isOnline = () => online;
    jest.mocked(deps.api.sync).mockImplementationOnce(async () => {
      online = false;
      throw new TypeError("Failed to fetch");
    });

    expect(await createSyncEngine(deps).run()).toEqual({ kind: "offline" });
  });
});
