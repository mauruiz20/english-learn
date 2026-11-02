import {
  ApiError,
  type ApiClient,
  type TransferEvent,
  type TransferredEvent,
} from "@english-learn/api-client";
import type { SettingsRepository, StoredEvent } from "@english-learn/domain";
import { importUrl } from "../model/origin-move";

/** Why a transfer step failed, in the terms the screens explain. */
export type TransferFailure = {
  readonly reason:
    /** No connection (the request never got an answer). */
    | "offline"
    /** 413: the log is over the API's 2 MiB. */
    | "too-large"
    /** 429: too many attempts from this address; `retryAfterSeconds` says how long to wait. */
    | "rate-limited"
    /** 404: the link expired (15 minutes) or was already used. */
    | "not-found"
    /** Anything else the API answered. */
    | "server";
  readonly retryAfterSeconds: number | null;
};

export class TransferError extends Error {
  override readonly name = "TransferError";

  constructor(readonly failure: TransferFailure) {
    super(`Progress transfer failed: ${failure.reason}`);
  }
}

export function transferFailure(error: unknown): TransferFailure {
  if (!(error instanceof ApiError)) return { reason: "offline", retryAfterSeconds: null };
  const reason =
    error.status === 413
      ? "too-large"
      : error.status === 429
        ? "rate-limited"
        : error.code === "transfer_not_found"
          ? "not-found"
          : "server";
  return { reason, retryAfterSeconds: reason === "rate-limited" ? error.retryAfterSeconds : null };
}

function toWire({ id, occurredAt, localDate, type, payload }: StoredEvent): TransferEvent {
  return { id, occurredAt, localDate, type, payload: payload as TransferEvent["payload"] };
}

/**
 * Old address: uploads this device's whole event log as a transfer, remembers where the progress
 * went (later visits go straight there) and opens the new address's import page with the token
 * in the fragment. On failure nothing is remembered and the learner stays, to retry.
 */
export async function sendProgress({
  store,
  api,
  settings,
  newOrigin,
  go,
}: {
  store: { getAllEvents(): Promise<readonly StoredEvent[]> };
  api: Pick<ApiClient, "createTransfer">;
  settings: Pick<SettingsRepository, "setMigratedTo">;
  newOrigin: string;
  /** Leaves for `url` (the browser's `location.assign`). */
  go: (url: string) => void;
}): Promise<void> {
  const events = await store.getAllEvents();
  let token: string;
  try {
    ({ token } = await api.createTransfer({ events: events.map(toWire) }));
  } catch (error) {
    throw new TransferError(transferFailure(error));
  }
  await settings.setMigratedTo(newOrigin);
  go(importUrl(newOrigin, token));
}

/**
 * New address: claims a transfer (once: the API forgets it) and imports its events as unsynced
 * events of this device. The claimed events are kept in memory, so when saving them fails a
 * retry saves them again instead of claiming a used token. Resolves to the events added.
 */
export function createProgressReceiver({
  api,
  store,
  deviceId,
}: {
  api: Pick<ApiClient, "claimTransfer">;
  store: { importEvents(events: readonly StoredEvent[]): Promise<number> };
  deviceId: string;
}): (token: string) => Promise<number> {
  const claimed = new Map<string, readonly TransferredEvent[]>();
  return async (token) => {
    let events = claimed.get(token);
    if (events === undefined) {
      try {
        ({ events } = await api.claimTransfer(token));
      } catch (error) {
        throw new TransferError(transferFailure(error));
      }
      claimed.set(token, events);
    }
    return store.importEvents(events.map((event) => ({ ...event, deviceId })));
  };
}
