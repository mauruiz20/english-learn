import { useSyncExternalStore } from "react";
import { appServiceWorkerUpdates } from "@/infrastructure/pwa/app-service-worker";
import type { ServiceWorkerUpdates } from "@/infrastructure/pwa/service-worker-updates";
import { UpdateBannerView } from "./update-banner-view";

/**
 * Offers a new web version once it is installed and waiting. Nothing reloads until the learner
 * presses "Actualizar" (never mid-lesson on its own). Native has no service worker: never shown.
 */
export function UpdateBanner({
  updates = appServiceWorkerUpdates,
}: {
  updates?: ServiceWorkerUpdates;
}) {
  const status = useSyncExternalStore(updates.subscribe, updates.getSnapshot, updates.getSnapshot);
  if (status === "idle") return null;
  return <UpdateBannerView applying={status === "applying"} onUpdate={updates.apply} />;
}
