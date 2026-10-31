import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useProgressVersion } from "@/features/account/account-context";
import { useAppServices } from "@/infrastructure/services/app-services";
import { AlbumView, type AlbumViewState } from "./album-view";
import { loadUnlocked } from "./use-new-achievements";

/** Loads the album from the stored progress every time the screen gains focus. */
export function AlbumContainer({ content = corpus }: { content?: Corpus }) {
  const { progressRepository } = useAppServices();
  const router = useRouter();
  const [state, setState] = useState<AlbumViewState>({ status: "loading" });
  const progressVersion = useProgressVersion();

  const load = useCallback(() => {
    let active = true;
    loadUnlocked(progressRepository, content).then(
      (unlocked) => active && setState({ status: "ready", unlocked }),
      (error: unknown) => {
        if (!active) return;
        console.error("Failed to load the album", error);
        setState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
    // `progressVersion` reloads the album after a sync brought progress from another device.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressRepository, content, progressVersion]);

  useFocusEffect(load);

  return (
    <AlbumView
      state={state}
      onGoHome={() => (router.canDismiss() ? router.dismissAll() : router.replace("/"))}
    />
  );
}
