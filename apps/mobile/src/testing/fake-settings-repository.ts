import type { SettingsRepository } from "@english-learn/domain";

/** In-memory `SettingsRepository` for tests. */
export function createFakeSettingsRepository(
  initial: { soundEnabled?: boolean } = {},
): SettingsRepository & { readonly soundEnabled: () => boolean } {
  let soundEnabled = initial.soundEnabled ?? true;
  return {
    soundEnabled: () => soundEnabled,
    getSoundEnabled: async () => soundEnabled,
    setSoundEnabled: async (next) => {
      soundEnabled = next;
    },
  };
}
