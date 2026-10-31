import type { AccountMarker, SettingsRepository } from "@english-learn/domain";

/** In-memory `SettingsRepository` for tests. */
export function createFakeSettingsRepository(
  initial: {
    soundEnabled?: boolean;
    lookupHintDismissed?: boolean;
    account?: AccountMarker | null;
    saveProgressSuggestionDismissed?: boolean;
  } = {},
): SettingsRepository & {
  readonly soundEnabled: () => boolean;
  readonly lookupHintDismissed: () => boolean;
  readonly account: () => AccountMarker | null;
  readonly saveProgressSuggestionDismissed: () => boolean;
} {
  let soundEnabled = initial.soundEnabled ?? true;
  let lookupHintDismissed = initial.lookupHintDismissed ?? false;
  let account = initial.account ?? null;
  let saveProgressSuggestionDismissed = initial.saveProgressSuggestionDismissed ?? false;
  return {
    soundEnabled: () => soundEnabled,
    lookupHintDismissed: () => lookupHintDismissed,
    account: () => account,
    saveProgressSuggestionDismissed: () => saveProgressSuggestionDismissed,
    getLookupHintDismissed: async () => lookupHintDismissed,
    setLookupHintDismissed: async () => {
      lookupHintDismissed = true;
    },
    getSoundEnabled: async () => soundEnabled,
    setSoundEnabled: async (next) => {
      soundEnabled = next;
    },
    getAccount: async () => account,
    setAccount: async (next) => {
      account = next;
    },
    clearAccount: async () => {
      account = null;
    },
    getSaveProgressSuggestionDismissed: async () => saveProgressSuggestionDismissed,
    setSaveProgressSuggestionDismissed: async () => {
      saveProgressSuggestionDismissed = true;
    },
  };
}
