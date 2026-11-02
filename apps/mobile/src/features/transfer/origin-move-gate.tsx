import type { ApiClient } from "@english-learn/api-client";
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { useAppServices } from "@/infrastructure/services/app-services";
import { createTransferApi, originMove } from "@/infrastructure/transfer/transfer-config";
import { TransferError, sendProgress } from "./application/transfer-progress";
import type { MoveBannerStatus } from "./move-banner";
import { decideVisit, type OriginMove, type VisitLocation } from "./model/origin-move";

/** What home shows on the old address: the move banner's state and its two actions. */
export type OriginMoveOffer = {
  readonly newOrigin: string;
  readonly status: MoveBannerStatus;
  readonly take: () => void;
  readonly skip: () => void;
};

/** Provided by `OriginMoveGate`; tests provide an offer directly. */
export const OriginMoveOfferContext = createContext<OriginMoveOffer | null>(null);

/** The move offer on the old web address; null everywhere else (and outside the gate). */
export function useOriginMoveOffer(): OriginMoveOffer | null {
  return use(OriginMoveOfferContext);
}

const browserLocation = (): VisitLocation | null =>
  Platform.OS === "web" && typeof window !== "undefined" ? window.location : null;

/**
 * The app's old web address, right after the database opened and before any screen: a learner
 * whose progress already moved, or who has none, goes straight to the same page on the new
 * address (`location.replace`); one with progress sees the app with the move offer on home.
 * Any other address (the new one, native) renders the app at once and reads nothing.
 */
export function OriginMoveGate({
  children,
  move: givenMove,
  location: givenLocation,
  replace = (url) => window.location.replace(url),
  assign = (url) => window.location.assign(url),
  api: givenApi,
}: {
  children: ReactNode;
  move?: OriginMove;
  location?: VisitLocation | null;
  replace?: (url: string) => void;
  assign?: (url: string) => void;
  api?: Pick<ApiClient, "createTransfer">;
}) {
  const { settingsRepository, transfer } = useAppServices();
  const [move] = useState(() => givenMove ?? originMove());
  const [location] = useState(() =>
    givenLocation === undefined ? browserLocation() : givenLocation,
  );
  const onOldOrigin = location !== null && location.origin === move.oldOrigin && transfer;
  const [visit, setVisit] = useState<"checking" | "offer" | "app">(
    onOldOrigin ? "checking" : "app",
  );
  const [status, setStatus] = useState<MoveBannerStatus>({ kind: "idle" });

  useEffect(() => {
    if (!onOldOrigin || location === null) return;
    let active = true;
    Promise.all([settingsRepository.getMigratedTo(), transfer.getAllEvents()]).then(
      ([migratedTo, events]) => {
        if (!active) return;
        const decided = decideVisit({ move, location, migratedTo, hasProgress: events.length > 0 });
        // Stays "checking" (nothing shown) while the browser leaves.
        if (decided.kind === "redirect") replace(decided.url);
        else setVisit(decided.kind);
      },
      (error: unknown) => {
        console.error("Failed to check the move to the new address", error);
        if (active) setVisit("app");
      },
    );
    return () => {
      active = false;
    };
    // Once per page load: the decision is about this visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const offer = useMemo<OriginMoveOffer | null>(() => {
    if (visit !== "offer" || !transfer) return null;
    return {
      newOrigin: move.newOrigin,
      status,
      take: () => {
        setStatus({ kind: "sending" });
        sendProgress({
          store: transfer,
          api: givenApi ?? createTransferApi(),
          settings: settingsRepository,
          newOrigin: move.newOrigin,
          go: assign,
        }).catch((error: unknown) => {
          console.error("Failed to send the progress to the new address", error);
          setStatus({
            kind: "failed",
            failure:
              error instanceof TransferError
                ? error.failure
                : { reason: "server", retryAfterSeconds: null },
          });
        });
      },
      skip: () => assign(`${move.newOrigin}/`),
    };
  }, [visit, status, move, transfer, settingsRepository, givenApi, assign]);

  if (visit === "checking") return null;
  return <OriginMoveOfferContext value={offer}>{children}</OriginMoveOfferContext>;
}
