import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { router } from "expo-router";
import { Platform } from "react-native";
import { COMPLETE_PATH } from "@/infrastructure/auth/callback-relay";
import { accountAvailability } from "@/infrastructure/auth/account-config";
import type { SessionState } from "@/infrastructure/auth/auth-session";
import { useAppServices } from "@/infrastructure/services/app-services";
import type { SyncStatus } from "@/infrastructure/sync/sync-coordinator";
import { AccountContext, type AccountContextValue } from "./account-context";
import { createAccountRuntime, type AccountRuntime } from "./account-runtime";

const SIGNED_OUT: SessionState = { status: "signed-out" };
const IDLE: SyncStatus = { kind: "idle" };
const noop = () => () => {};

/**
 * The optional account: Google sign-in and background progress sync, on the web app's own site
 * only. On native and on other sites nothing is created and no network call is made; screens
 * see `availability` and show a note instead.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const services = useAppServices();
  const [availability] = useState(() =>
    accountAvailability(
      Platform.OS,
      typeof window === "undefined" ? null : (window.location?.origin ?? null),
    ),
  );
  const [runtime] = useState<AccountRuntime | null>(() =>
    availability === "available" && services.account !== undefined
      ? createAccountRuntime({
          storage: services.account,
          settings: services.settingsRepository,
          randomBytes: services.randomBytes,
          clock: services.clock,
          openCallbackCompletion: () => router.replace(COMPLETE_PATH),
        })
      : null,
  );
  const [progressVersion, setProgressVersion] = useState(0);

  const session = useSyncExternalStore(
    runtime?.session.subscribe ?? noop,
    () => runtime?.session.getState() ?? SIGNED_OUT,
  );
  const syncStatus = useSyncExternalStore(
    runtime?.coordinator.subscribe ?? noop,
    () => runtime?.coordinator.getStatus() ?? IDLE,
  );

  useEffect(() => {
    if (runtime === null) return;
    const unsubscribe = runtime.progressChanged.subscribe(() => setProgressVersion((n) => n + 1));
    const stop = runtime.start();
    return () => {
      unsubscribe();
      stop();
    };
  }, [runtime]);

  const value = useMemo<AccountContextValue>(
    () => ({
      availability,
      session,
      syncStatus,
      progressVersion,
      actions: runtime?.controller ?? null,
    }),
    [availability, session, syncStatus, progressVersion, runtime],
  );
  return <AccountContext value={value}>{children}</AccountContext>;
}
