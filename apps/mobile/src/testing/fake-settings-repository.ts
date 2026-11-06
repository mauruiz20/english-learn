import type {
  AccountMarker,
  Level,
  LocalDate,
  SettingsRepository,
  SpeechRate,
  ThemePreference,
} from "@english-learn/domain";

/** In-memory `SettingsRepository` for tests. */
export function createFakeSettingsRepository(
  initial: {
    soundEnabled?: boolean;
    pronunciationEnabled?: boolean;
    speechRate?: SpeechRate;
    lookupHintDismissed?: boolean;
    account?: AccountMarker | null;
    saveProgressSuggestionDismissed?: boolean;
    themePreference?: ThemePreference;
    migratedTo?: string | null;
    pathLevel?: Level | null;
    lastHomeVisit?: LocalDate | null;
  } = {},
): SettingsRepository & {
  readonly soundEnabled: () => boolean;
  readonly pronunciationEnabled: () => boolean;
  readonly speechRate: () => SpeechRate;
  readonly lookupHintDismissed: () => boolean;
  readonly account: () => AccountMarker | null;
  readonly saveProgressSuggestionDismissed: () => boolean;
  readonly themePreference: () => ThemePreference;
  readonly migratedTo: () => string | null;
  readonly pathLevel: () => Level | null;
  readonly lastHomeVisit: () => LocalDate | null;
} {
  let soundEnabled = initial.soundEnabled ?? true;
  let pronunciationEnabled = initial.pronunciationEnabled ?? true;
  let speechRate = initial.speechRate ?? "normal";
  let lookupHintDismissed = initial.lookupHintDismissed ?? false;
  let account = initial.account ?? null;
  let saveProgressSuggestionDismissed = initial.saveProgressSuggestionDismissed ?? false;
  let themePreference = initial.themePreference ?? "system";
  let migratedTo = initial.migratedTo ?? null;
  let pathLevel = initial.pathLevel ?? null;
  let lastHomeVisit = initial.lastHomeVisit ?? null;
  return {
    pathLevel: () => pathLevel,
    getPathLevel: async () => pathLevel,
    setPathLevel: async (level) => {
      pathLevel = level;
    },
    clearPathLevel: async () => {
      pathLevel = null;
    },
    lastHomeVisit: () => lastHomeVisit,
    getLastHomeVisit: async () => lastHomeVisit,
    setLastHomeVisit: async (date) => {
      lastHomeVisit = date;
    },
    migratedTo: () => migratedTo,
    themePreference: () => themePreference,
    soundEnabled: () => soundEnabled,
    pronunciationEnabled: () => pronunciationEnabled,
    speechRate: () => speechRate,
    getPronunciationEnabled: async () => pronunciationEnabled,
    setPronunciationEnabled: async (next) => {
      pronunciationEnabled = next;
    },
    getSpeechRate: async () => speechRate,
    setSpeechRate: async (next) => {
      speechRate = next;
    },
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
