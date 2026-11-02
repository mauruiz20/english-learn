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
 * New address: claims a transfer (once: the API forgets it) and hands its events back as this
 * device's, without saving anything: the learner sees a preview and decides. The caller keeps
 * the events in memory, so a failed save is retried without claiming a used token.
 */
export async function claimProgress({
  api,
  token,
  deviceId,
}: {
  api: Pick<ApiClient, "claimTransfer">;
  token: string;
  deviceId: string;
}): Promise<StoredEvent[]> {
  let events: readonly TransferredEvent[];
  try {
    ({ events } = await api.claimTransfer(token));
  } catch (error) {
    throw new TransferError(transferFailure(error));
  }
  return events.map((event) => ({ ...event, deviceId }));
}
