import type { Outfit } from "@english-learn/domain";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useProgressVersion } from "@/features/account/account-context";
import { useAppServices } from "@/infrastructure/services/app-services";
import { AviOutfitContext } from "@/shared/ui/mascot";
import { outfitArt } from "./art/item-art";
import { wardrobeFromRewards } from "./model/wardrobe";

const ReloadContext = createContext<() => void>(() => {});

/**
 * Dresses every `Avi` in the app in the learner's outfit: reads it from the progress (the
 * equipped items the learner owns) once, again after a sync changed progress, and whenever the
 * wardrobe saved a change (`useReloadOutfit`).
 */
export function WardrobeOutfitProvider({ children }: { children: ReactNode }) {
  const { progressRepository } = useAppServices();
  const progressVersion = useProgressVersion();
  const [outfit, setOutfit] = useState<Outfit>({});
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let active = true;
    progressRepository.getRewards().then(
      (rewards) => {
        if (active) setOutfit(wardrobeFromRewards(rewards).outfit);
      },
      (error: unknown) => console.error("Failed to load Avi's outfit", error),
    );
    return () => {
      active = false;
    };
  }, [progressRepository, progressVersion, reloads]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);
  const art = useMemo(() => outfitArt(outfit), [outfit]);
  return (
    <ReloadContext value={reload}>
      <AviOutfitContext value={art}>{children}</AviOutfitContext>
    </ReloadContext>
  );
}

/** Reads the outfit again (after the wardrobe wrote a purchase or a change of clothes). */
export function useReloadOutfit(): () => void {
  return use(ReloadContext);
}
