import type { AccountMarker, SettingsRepository, ThemePreference } from "@english-learn/domain";

/** In-memory `SettingsRepository` for tests. */
export function createFakeSettingsRepository(
  initial: {
    soundEnabled?: boolean;
    lookupHintDismissed?: boolean;
    account?: AccountMarker | null;
    saveProgressSuggestionDismissed?: boolean;
    themePreference?: ThemePreference;
    migratedTo?: string | null;
  } = {},
): SettingsRepository & {
  readonly soundEnabled: () => boolean;
  readonly lookupHintDismissed: () => boolean;
  readonly account: () => AccountMarker | null;
  readonly saveProgressSuggestionDismissed: () => boolean;
  readonly themePreference: () => ThemePreference;
  readonly migratedTo: () => string | null;
} {
  let soundEnabled = initial.soundEnabled ?? true;
  let lookupHintDismissed = initial.lookupHintDismissed ?? false;
  let account = initial.account ?? null;
  let saveProgressSuggestionDismissed = initial.saveProgressSuggestionDismissed ?? false;
  let themePreference = initial.themePreference ?? "system";
  let migratedTo = initial.migratedTo ?? null;
  return {
    migratedTo: () => migratedTo,
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
    getMigratedTo: async () => migratedTo,
    setMigratedTo: async (origin) => {
      migratedTo = origin;
    },
  };
}
