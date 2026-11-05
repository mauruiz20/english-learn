import { ApiError } from "@english-learn/api-client";
import type { SettingsRepository } from "@english-learn/domain";
import type { RandomBytes } from "@/features/progress/progress-events";
import type { AuthSession } from "@/infrastructure/auth/auth-session";
import {
  CALLBACK_PATH,
  GOOGLE_CLIENT_ID,
  googleAuthorizationUrl,
  parseCallbackFragment,
  randomToken,
  type AuthIntent,
  type PendingSignInStore,
} from "@/infrastructure/auth/oidc";
import type { SyncCoordinator } from "@/infrastructure/sync/sync-coordinator";

/** Why the Google callback could not complete a sign-in (the screen picks the copy). */
export type CallbackFailureReason =
  /** No sign-in of this tab matches (forged, replayed, too old, or another tab). */
  | "state"
  /** The learner cancelled at Google, or Google refused. */
  | "cancelled"
  /** The API refused the ID token or could not be reached. */
  | "api"
  /** A re-authentication for deleting the account picked another Google account. */
  | "wrong-account";

export class CallbackError extends Error {
  override readonly name = "CallbackError";
  constructor(
    readonly reason: CallbackFailureReason,
    readonly cause?: unknown,
  ) {
    super(`Google sign-in failed (${reason})`);
  }
}

/** Where the account screen goes after deleting the account through a Google re-sign-in. */
export const DELETED_RETURN_PATH = "/cuenta?eliminada=1";

/**
 * The account's use cases on the web: start and complete the Google redirect sign-in, sign out
 * (keeping or deleting this device's progress), delete the account (signing in again first when
 * the API asks for a recent sign-in) and sync. Framework-free: the provider wires it.
 */
export function createAccountController({
  origin,
  session,
  coordinator,
  store,
  settings,
  deleteAccount,
  pending,
  randomBytes,
  now = Date.now,
  redirect,
  onProgressChanged,
  authorizationEndpoint,
}: {
  /** This page's origin; Google sends the learner back to `<origin>/auth/callback`. */
  origin: string;
  session: Pick<AuthSession, "signIn" | "signOut" | "forget" | "authorized" | "getState">;
  coordinator: Pick<SyncCoordinator, "request" | "stop" | "resume">;
  store: { resetSyncState(): Promise<void>; clearProgress(): Promise<void> };
  /** Device notes tied to the progress (the plumas welcome, the path level), forgotten with it. */
  settings: Pick<SettingsRepository, "clearPlumasWelcome" | "clearPathLevel">;
  /** `DELETE /v1/account` with the current access token. */
  deleteAccount: () => Promise<void>;
  pending: PendingSignInStore;
  randomBytes: RandomBytes;
  now?: () => number;
  /** Full-page navigation (to Google). */
  redirect: (url: string) => void;
  onProgressChanged: () => void;
  /** Google's authorization endpoint by default; a fake one in e2e builds. */
  authorizationEndpoint?: string;
}) {
  function startSignIn(returnTo: string, intent: AuthIntent = "sign-in"): void {
    const state = randomToken(randomBytes);
    const nonce = randomToken(randomBytes);
    const current = session.getState();
    const accountId = current.status === "signed-in" ? current.account.userId : undefined;
    pending.save({
      state,
      nonce,
      returnTo,
      intent,
      createdAt: now(),
      ...(accountId === undefined ? {} : { accountId }),
    });
    redirect(
      googleAuthorizationUrl({
        clientId: GOOGLE_CLIENT_ID,
        redirectUri: `${origin}${CALLBACK_PATH}`,
        state,
        nonce,
        ...(authorizationEndpoint === undefined ? {} : { endpoint: authorizationEndpoint }),
      }),
    );
  }

  /** After deletion the server has nothing: forget the session, keep the progress unsynced. */
  async function afterDeletion(): Promise<void> {
    // A sync in flight must not mark the log synced again after the reset.
    await coordinator.stop();
    session.forget();
    await store.resetSyncState();
  }

  async function deleteNow(): Promise<"deleted" | "reauthenticate"> {
    try {
      await session.authorized(() => deleteAccount());
    } catch (error) {
      if (error instanceof ApiError && error.code === "reauthentication_required") {
        return "reauthenticate";
      }
      throw error;
    }
    await afterDeletion();
    return "deleted";
  }

  return {
    startSignIn,

    /**
     * Handles `/auth/callback`'s fragment: checks `state` against this tab's pending sign-in,
     * signs in with the ID token and its nonce, starts the first sync and, when the sign-in was
     * a re-authentication for deleting the account, deletes it. Resolves to the path to go to.
     */
    async completeSignIn(hash: string): Promise<string> {
      const result = parseCallbackFragment(hash);
      if (result.kind === "invalid") throw new CallbackError("state");
      const signIn = pending.take(result.state);
      if (signIn === null) throw new CallbackError("state");
      if (result.kind === "error") throw new CallbackError("cancelled", result.error);
      let account;
      try {
        account = await session.signIn(result.idToken, signIn.nonce);
      } catch (error) {
        throw new CallbackError("api", error);
      }
      if (signIn.intent === "delete-account") {
        if (signIn.accountId !== undefined && signIn.accountId !== account.userId) {
          void coordinator.request();
          throw new CallbackError("wrong-account");
        }
        // The fresh sign-in satisfies the API's recent-authentication rule.
        if ((await deleteNow()) === "deleted") return DELETED_RETURN_PATH;
      }
      // First sync: uploads the whole local history (baseline included) and pulls the account's.
      void coordinator.request();
      return signIn.returnTo;
    },

    /**
     * Stops the sync (a sync in flight would bring deleted progress back, or mark the kept one
     * synced again), resets or deletes this device's progress, and only then ends the session:
     * the screen shows "signed out" once the device is done, so a reload right away cannot cut
     * the deletion short. When the store fails, the learner stays signed in and syncing.
     */
    async signOut({ keepLocalProgress }: { keepLocalProgress: boolean }): Promise<void> {
      await coordinator.stop();
      try {
        if (keepLocalProgress) await store.resetSyncState();
        else {
          await store.clearProgress();
          await settings.clearPlumasWelcome();
          await settings.clearPathLevel();
        }
      } catch (error) {
        coordinator.resume();
        throw error;
      }
      await session.signOut();
      if (!keepLocalProgress) onProgressChanged();
    },

    /** "redirecting": the API wants a recent sign-in; deletion resumes after Google. */
    async deleteAccount(): Promise<"deleted" | "redirecting"> {
      if ((await deleteNow()) === "deleted") return "deleted";
      startSignIn("/cuenta", "delete-account");
      return "redirecting";
    },

    syncNow: () => coordinator.request(),
  };
}

export type AccountController = ReturnType<typeof createAccountController>;
