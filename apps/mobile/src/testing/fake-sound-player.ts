import type { SoundName, SoundPlayer } from "@/infrastructure/sound/sound-player";

export type FakeSoundPlayer = SoundPlayer & {
  /** Every sound played while enabled, in order. */
  readonly played: SoundName[];
  readonly enabled: () => boolean;
};

/** Records the sounds a test triggers instead of playing them. */
export function createFakeSoundPlayer(): FakeSoundPlayer {
  const played: SoundName[] = [];
  let enabled = true;
  return {
    played,
    enabled: () => enabled,
    play: (name) => {
      if (enabled) played.push(name);
    },
    setEnabled: (next) => {
      enabled = next;
    },
  };
}
