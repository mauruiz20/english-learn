import { ApiError } from "@english-learn/api-client";
import type { StoredEvent } from "@english-learn/domain";
import {
  TransferError,
  createProgressReceiver,
  sendProgress,
  transferFailure,
} from "./transfer-progress";

const NEW_ORIGIN = "https://english.maumar.com.ar";

function stored(id: string, deviceId = "old-device"): StoredEvent {
  return {
    id,
    deviceId,
    occurredAt: 1_793_361_600_000,
    localDate: "2026-10-30",
    type: "item_reviewed",
    payload: { v: 1, sessionId: "s1", itemId: "i1", grade: 3 },
  };
}

function wire({ deviceId: _, ...event }: StoredEvent) {
  return event as { id: string; payload: { [key: string]: unknown } } & Omit<
    StoredEvent,
    "deviceId" | "payload"
  >;
}

describe("transferFailure", () => {
  it.each([
    [
      new ApiError(413, "payload_too_large", "big"),
      { reason: "too-large", retryAfterSeconds: null },
    ],
    [
      new ApiError(429, "rate_limited", "slow", 120),
      { reason: "rate-limited", retryAfterSeconds: 120 },
    ],
    [
      new ApiError(404, "transfer_not_found", "gone"),
      { reason: "not-found", retryAfterSeconds: null },
    ],
    [new ApiError(503, "http_503", "down"), { reason: "server", retryAfterSeconds: null }],
    [new TypeError("Failed to fetch"), { reason: "offline", retryAfterSeconds: null }],
  ])("classifies %s", (error, failure) => {
    expect(transferFailure(error)).toEqual(failure);
  });
});

describe("sendProgress", () => {
  it("uploads every event, remembers the move, then opens the import page with the token", async () => {
    const events = [stored("e1"), stored("e2")];
    const calls: string[] = [];
    const createTransfer = jest.fn(async () => {
      calls.push("create");
      return { token: "tok-123", expiresAt: "2026-10-30T12:15:00Z" };
    });
    const setMigratedTo = jest.fn(async () => {
      calls.push("remember");
    });
    const go = jest.fn(() => calls.push("go"));

    await sendProgress({
      store: { getAllEvents: async () => events },
      api: { createTransfer },
      settings: { setMigratedTo },
      newOrigin: NEW_ORIGIN,
      go,
    });

    expect(createTransfer).toHaveBeenCalledWith({ events: events.map(wire) });
    expect(setMigratedTo).toHaveBeenCalledWith(NEW_ORIGIN);
    expect(go).toHaveBeenCalledWith("https://english.maumar.com.ar/importar#t=tok-123");
    expect(calls).toEqual(["create", "remember", "go"]);
  });

  it("fails with a classified reason and neither remembers nor leaves", async () => {
    const setMigratedTo = jest.fn();
    const go = jest.fn();

    const sending = sendProgress({
      store: { getAllEvents: async () => [stored("e1")] },
      api: {
        createTransfer: async () => {
          throw new ApiError(429, "rate_limited", "slow", 60);
        },
      },
      settings: { setMigratedTo },
      newOrigin: NEW_ORIGIN,
      go,
    });

    await expect(sending).rejects.toEqual(
      new TransferError({ reason: "rate-limited", retryAfterSeconds: 60 }),
    );
    expect(setMigratedTo).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
  });
});

describe("createProgressReceiver", () => {
  it("claims the transfer and imports its events as this device's", async () => {
    const importEvents = jest.fn(async (events: readonly StoredEvent[]) => events.length);
    const receive = createProgressReceiver({
      api: { claimTransfer: async () => ({ events: [wire(stored("e1"))] }) },
      store: { importEvents },
      deviceId: "new-device",
    });

    expect(await receive("tok")).toBe(1);
    expect(importEvents).toHaveBeenCalledWith([stored("e1", "new-device")]);
  });

  it("reports an expired or used link", async () => {
    const receive = createProgressReceiver({
      api: {
        claimTransfer: async () => {
          throw new ApiError(404, "transfer_not_found", "gone");
        },
      },
      store: { importEvents: async () => 0 },
      deviceId: "new-device",
    });

    await expect(receive("tok")).rejects.toEqual(
      new TransferError({ reason: "not-found", retryAfterSeconds: null }),
    );
  });

  it("keeps claimed events when saving fails, so a retry does not claim again", async () => {
    const claimTransfer = jest.fn(async () => ({ events: [wire(stored("e1"))] }));
    const importEvents = jest
      .fn<Promise<number>, [readonly StoredEvent[]]>()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(1);
    const receive = createProgressReceiver({
      api: { claimTransfer },
      store: { importEvents },
      deviceId: "new-device",
    });

    await expect(receive("tok")).rejects.toThrow("disk full");
    expect(await receive("tok")).toBe(1);
    expect(claimTransfer).toHaveBeenCalledTimes(1);
  });
});
