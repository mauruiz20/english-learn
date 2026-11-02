import type { AccountMarker, SettingsRepository, ThemePreference } from "@english-learn/domain";

/** In-memory `SettingsRepository` for tests. */
export function createFakeSettingsRepository(
  initial: {
    soundEnabled?: boolean;
    lookupHintDismissed?: boolean;
    account?: AccountMarker | null;
    saveProgressSuggestionDismissed?: boolean;
    themePreference?: ThemePreference;
  } = {},
): SettingsRepository & {
  readonly soundEnabled: () => boolean;
  readonly lookupHintDismissed: () => boolean;
  readonly account: () => AccountMarker | null;
  readonly saveProgressSuggestionDismissed: () => boolean;
  readonly themePreference: () => ThemePreference;
} {
  let soundEnabled = initial.soundEnabled ?? true;
  let lookupHintDismissed = initial.lookupHintDismissed ?? false;
  let account = initial.account ?? null;
  let saveProgressSuggestionDismissed = initial.saveProgressSuggestionDismissed ?? false;
  let themePreference = initial.themePreference ?? "system";
  return {
    themePreference: () => themePreference,
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
    getThemePreference: async () => themePreference,
    setThemePreference: async (next) => {
      themePreference = next;
    },
  };
}
