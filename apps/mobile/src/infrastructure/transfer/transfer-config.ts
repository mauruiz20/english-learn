/**
 * The app's move from its old web address to the new one, and the API client a transfer uses.
 * E2E builds let a spec substitute local servers for both addresses; production builds drop that
 * branch and its module.
 */
import { createApiClient, type ApiClient } from "@english-learn/api-client";
import type { OriginMove } from "@/features/transfer/model/origin-move";
import { APP_WEB_ORIGIN, accountEndpoints } from "../auth/account-config";
import type * as E2eEndpoints from "../auth/e2e-endpoints";

export const OLD_WEB_ORIGIN = "https://english-learn-iwl.pages.dev";

export function originMove(): OriginMove {
  const move = { oldOrigin: OLD_WEB_ORIGIN, newOrigin: APP_WEB_ORIGIN };
  if (process.env.EXPO_PUBLIC_E2E === "1") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { e2eEndpoints } = require("../auth/e2e-endpoints") as typeof E2eEndpoints;
    const { oldWebOrigin, newWebOrigin } = e2eEndpoints();
    return { oldOrigin: oldWebOrigin ?? move.oldOrigin, newOrigin: newWebOrigin ?? move.newOrigin };
  }
  return move;
}

/** Transfers are anonymous: no access token, no credentials. */
export function createTransferApi(): Pick<ApiClient, "createTransfer" | "claimTransfer"> {
  return createApiClient({ baseUrl: accountEndpoints().apiBaseUrl, getAccessToken: () => null });
}
