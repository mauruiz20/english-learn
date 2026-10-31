import type { Corpus } from "@english-learn/content";
import type { ProgressRepository } from "@english-learn/domain";
import { useEffect, useRef, useState } from "react";
import { useAppServices, useSoundPlayer } from "@/infrastructure/services/app-services";
import {
  ACHIEVEMENTS,
  achievementFacts,
  newlyUnlocked,
  unlockedAchievements,
  type Achievement,
} from "./model/achievements";

/** The album sound comes after the completion arpeggio and the streak sparkle. */
export const ACHIEVEMENT_SOUND_DELAY_MS = 1300;

/** The ids of the stickers the stored progress has earned. */
export async function loadUnlocked(
  repository: ProgressRepository,
  content: Corpus,
): Promise<string[]> {
  const [states, xp, streak, placement] = await Promise.all([
    repository.getReviewStates(),
    repository.getXp(),
    repository.getStreak(),
    repository.getPlacementResult(),
  ]);
  return unlockedAchievements(achievementFacts(content, { states, xp, streak, placement }));
}

/**
 * The album stickers a session earned: what the progress unlocks once the session is `saved`,
 * minus what it unlocked when the session started. Plays the achievement sound once when there
 * is at least one. A failed read just earns nothing to show (the album still has them).
 */
export function useNewAchievements(saved: boolean, content: Corpus): readonly Achievement[] {
  const { progressRepository } = useAppServices();
  const sounds = useSoundPlayer();
  const before = useRef<string[] | null>(null);
  const [earned, setEarned] = useState<readonly Achievement[]>([]);

  useEffect(() => {
    let active = true;
    loadUnlocked(progressRepository, content).then(
      (ids) => {
        if (active && before.current === null) before.current = ids;
      },
      () => {},
    );
    return () => {
      active = false;
    };
    // Read once, when the session starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!saved || before.current === null) return;
    const had = before.current;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    loadUnlocked(progressRepository, content).then(
      (ids) => {
        if (!active) return;
        const fresh = new Set(newlyUnlocked(had, ids));
        if (fresh.size === 0) return;
        setEarned(ACHIEVEMENTS.filter((a) => fresh.has(a.id)));
        timer = setTimeout(() => sounds.play("achievement"), ACHIEVEMENT_SOUND_DELAY_MS);
      },
      () => {},
    );
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [saved, progressRepository, content, sounds]);

  return earned;
}
