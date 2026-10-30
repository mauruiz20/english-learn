import type { Verdict } from "@english-learn/domain";
import { useEffect, useRef } from "react";
import { useSoundPlayer } from "@/infrastructure/services/app-services";

/** The streak sparkle comes in once the completion arpeggio has mostly rung out. */
export const STREAK_SOUND_DELAY_MS = 600;

/**
 * Sounds of a lesson-like session: the verdict when feedback appears, and on completion the
 * "complete" arpeggio followed by the "streak" sparkle when the streak grew.
 */
export function useSessionSounds() {
  const sounds = useSoundPlayer();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return {
    verdict: (verdict: Verdict) => sounds.play(verdict),
    completed: (streakIncreased: boolean) => {
      sounds.play("complete");
      if (streakIncreased) {
        timer.current = setTimeout(() => sounds.play("streak"), STREAK_SOUND_DELAY_MS);
      }
    },
  };
}
