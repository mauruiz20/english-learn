import { createContext, use } from "react";
import type { AccountAvailability } from "@/infrastructure/auth/account-config";
import type { SessionState } from "@/infrastructure/auth/auth-session";
import type { SyncStatus } from "@/infrastructure/sync/sync-coordinator";
import type { AccountController } from "./application/account-controller";

export type AccountActions = Pick<
  AccountController,
  "startSignIn" | "completeSignIn" | "signOut" | "deleteAccount" | "syncNow"
>;

/** What screens know about the optional account (Google sign-in + progress sync, web only). */
export type AccountContextValue = {
  readonly availability: AccountAvailability;
  readonly session: SessionState;
  readonly syncStatus: SyncStatus;
  /** Bumped whenever progress changed outside the current screen (a sync, a local wipe). */
  readonly progressVersion: number;
  /** Null where accounts are not available (native app, another site). */
  readonly actions: AccountActions | null;
};

const UNAVAILABLE: AccountContextValue = {
  availability: "native",
  session: { status: "signed-out" },
  syncStatus: { kind: "idle" },
  progressVersion: 0,
  actions: null,
};

export const AccountContext = createContext<AccountContextValue>(UNAVAILABLE);

/** The account state; outside `AccountProvider` (tests, isolated components) it is unavailable. */
export function useAccount(): AccountContextValue {
  return use(AccountContext);
}

/** Add to a progress screen's load dependencies so it reloads after a sync changed progress. */
export function useProgressVersion(): number {
  return use(AccountContext).progressVersion;
}
