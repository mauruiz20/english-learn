import { createApiClient } from "@english-learn/api-client";
import { uuidv7, type Clock, type SettingsRepository } from "@english-learn/domain";
import type { RandomBytes } from "@/features/progress/progress-events";
import { accountEndpoints } from "@/infrastructure/auth/account-config";
import { createAuthSession } from "@/infrastructure/auth/auth-session";
import { CALLBACK_PATH, createPendingSignInStore } from "@/infrastructure/auth/oidc";
import type { AccountStorage } from "@/infrastructure/services/app-services";
import { createSyncCoordinator } from "@/infrastructure/sync/sync-coordinator";
import { createSyncEngine } from "@/infrastructure/sync/sync-engine";
import { createChangeSignal, startSyncTriggers } from "@/infrastructure/sync/sync-triggers";
import { createAccountController } from "./application/account-controller";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Wires the web account: API client (cookie transport), session, sync engine and coordinator,
 * and the controller. Browser-only (window, sessionStorage, navigator); built once per page.
 */
export function createAccountRuntime({
  storage,
  settings,
  randomBytes,
  clock,
}: {
  storage: AccountStorage;
  settings: SettingsRepository;
  randomBytes: RandomBytes;
  clock: Clock;
}) {
  const progressChanged = createChangeSignal();
  const endpoints = accountEndpoints();
  const api = createApiClient({
    baseUrl: endpoints.apiBaseUrl,
    getAccessToken: () => session.accessToken(),
  });
  const session = createAuthSession({ api, settings });
  const engine = createSyncEngine({
    api,
    store: storage.syncStore,
    refreshSession: () => session.refresh().catch(() => false),
    newDeviceId: () => uuidv7(clock.nowMs(), randomBytes),
    sleep,
    random: Math.random,
    isOnline: () => navigator.onLine !== false,
  });
  const coordinator = createSyncCoordinator({
    engine,
    onProgressChanged: progressChanged.emit,
    onSignedOut: () => session.forget(),
  });
  const controller = createAccountController({
    origin: window.location.origin,
    session,
    coordinator,
    store: storage.syncStore,
    deleteAccount: () => api.deleteAccount(),
    pending: createPendingSignInStore(window.sessionStorage),
    randomBytes,
    redirect: (url) => window.location.assign(url),
    onProgressChanged: progressChanged.emit,
    authorizationEndpoint: endpoints.googleAuthUrl,
  });

  /** Restores the session and runs the sync triggers while signed in. Returns a stop function. */
  function start(): () => void {
    let stopTriggers: (() => void) | null = null;
    const follow = () => {
      const signedIn = session.getState().status === "signed-in";
      if (signedIn && stopTriggers === null) {
        coordinator.resume();
        stopTriggers = startSyncTriggers({
          request: coordinator.request,
          target: window,
          isVisible: () => document.visibilityState === "visible",
          localChanges: storage.localChanges,
        });
      } else if (!signedIn && stopTriggers !== null) {
        stopTriggers();
        stopTriggers = null;
        void coordinator.stop();
      }
    };
    const unsubscribe = session.subscribe(follow);
    // The callback page signs in itself; a restore there would only race with it.
    if (window.location.pathname !== CALLBACK_PATH) {
      void session.restore().then(() => {
        if (session.getState().status === "signed-in") void coordinator.request();
      });
    }
    follow();
    return () => {
      unsubscribe();
      stopTriggers?.();
      stopTriggers = null;
    };
  }

  return { session, coordinator, controller, progressChanged, start };
}

export type AccountRuntime = ReturnType<typeof createAccountRuntime>;
