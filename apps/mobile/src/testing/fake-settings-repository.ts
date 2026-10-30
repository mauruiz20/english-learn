import type { SettingsRepository } from "@english-learn/domain";

/** In-memory `SettingsRepository` for tests. */
export function createFakeSettingsRepository(
  initial: { soundEnabled?: boolean; lookupHintDismissed?: boolean } = {},
): SettingsRepository & {
  readonly soundEnabled: () => boolean;
  readonly lookupHintDismissed: () => boolean;
} {
  let soundEnabled = initial.soundEnabled ?? true;
  let lookupHintDismissed = initial.lookupHintDismissed ?? false;
  return {
    soundEnabled: () => soundEnabled,
    lookupHintDismissed: () => lookupHintDismissed,
    getLookupHintDismissed: async () => lookupHintDismissed,
    setLookupHintDismissed: async () => {
      lookupHintDismissed = true;
    },
    getSoundEnabled: async () => soundEnabled,
    setSoundEnabled: async (next) => {
      soundEnabled = next;
    },
  };
}
