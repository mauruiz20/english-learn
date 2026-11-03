import { useSoundPlayer } from "@/infrastructure/services/app-services";
import type { SoundPlayer } from "@/infrastructure/sound/sound-player";

/** Taps closer together than this click once: a double tap or a mashed button stays quiet. */
export const PRESS_SOUND_THROTTLE_MS = 80;

// One throttle per player, shared by every button: two presses in a row click once.
const lastClick = new WeakMap<SoundPlayer, number>();

/**
 * Plays the soft "press" click (and, on iOS and Android, its light haptic) for a button press.
 * Fire and forget: it never throws nor waits, so it cannot hold a press or a navigation back.
 * The player stays silent while sounds are off.
 */
export function playPressSound(sounds: SoundPlayer, now: number = Date.now()): void {
  const last = lastClick.get(sounds);
  if (last !== undefined && now - last < PRESS_SOUND_THROTTLE_MS) return;
  lastClick.set(sounds, now);
  try {
    sounds.play("press");
  } catch (error) {
    console.warn("Could not play the press sound", error);
  }
}

/**
 * The press click for the shared pressables (`PressableScale`, `PaperStrip`, the header icon
 * buttons). A press that plays its own sound (a verdict, a completion, the choice tap) opts out
 * through the primitive's `pressSound={false}`.
 */
export function usePressSound(): () => void {
  const sounds = useSoundPlayer();
  return () => playPressSound(sounds);
}
