/** The app's interaction sounds (assets/sounds/*.wav, made by scripts/generate-sounds.mjs). */
export const SOUND_NAMES = [
  "tap",
  "press",
  "correct",
  "almost",
  "wrong",
  "complete",
  "streak",
  "achievement",
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

/**
 * Plays short interaction sounds. Fire and forget: `play` never blocks nor throws (a sound must
 * never break a lesson). Injected through `AppServices` so tests use a fake.
 */
export interface SoundPlayer {
  play(name: SoundName): void;
  /** Muted players stay silent until enabled again. */
  setEnabled(enabled: boolean): void;
}

/** A player that never makes a sound (default outside the app's services, e.g. in tests). */
export const silentSoundPlayer: SoundPlayer = {
  play: () => {},
  setEnabled: () => {},
};
