import { ApiError } from "@english-learn/api-client";
import type { StoredEvent } from "@english-learn/domain";
import { TransferError, claimProgress, sendProgress, transferFailure } from "./transfer-progress";

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

describe("claimProgress", () => {
  it("claims the transfer and hands its events back as this device's, without saving them", async () => {
    const claimTransfer = jest.fn(async () => ({ events: [wire(stored("e1"))] }));

    expect(
      await claimProgress({ api: { claimTransfer }, token: "tok", deviceId: "new-device" }),
    ).toEqual([stored("e1", "new-device")]);
    expect(claimTransfer).toHaveBeenCalledWith("tok");
  });

  it("reports an expired or used link", async () => {
    const claiming = claimProgress({
      api: {
        claimTransfer: async () => {
          throw new ApiError(404, "transfer_not_found", "gone");
        },
      },
      token: "tok",
      deviceId: "new-device",
    });

    await expect(claiming).rejects.toEqual(
      new TransferError({ reason: "not-found", retryAfterSeconds: null }),
    );
  });
});
