/**
 * The account this device is signed in to, as remembered across restarts: who, never a token
 * (the session itself lives in an HttpOnly cookie and an in-memory access token).
 */
export type AccountMarker = {
  readonly userId: string;
  readonly email: string;
};

/** The app's look: follow the device's light/dark setting, or always one of them. */
export type ThemePreference = "system" | "light" | "dark";

/** The learner's app preferences, kept on the device. Implemented by the app layer. */
export interface SettingsRepository {
  /** Whether interaction sounds play; on until the learner turns them off. */
  getSoundEnabled(): Promise<boolean>;
  setSoundEnabled(enabled: boolean): Promise<void>;
  /** Whether the learner dismissed the one-time "tap a word" hint of the word lookup. */
  getLookupHintDismissed(): Promise<boolean>;
  setLookupHintDismissed(): Promise<void>;
  /** The signed-in account, or null when signed out (or never signed in). */
  getAccount(): Promise<AccountMarker | null>;
  setAccount(account: AccountMarker): Promise<void>;
  clearAccount(): Promise<void>;
  /** Whether the learner dismissed the one-time "save your progress" suggestion. */
  getSaveProgressSuggestionDismissed(): Promise<boolean>;
  setSaveProgressSuggestionDismissed(): Promise<void>;
  /** Light, dark or the device's setting; follows the system until the learner picks one. */
  getThemePreference(): Promise<ThemePreference>;
  setThemePreference(preference: ThemePreference): Promise<void>;
  /**
   * The web origin this device's progress was transferred to (the app moved address), or null.
   * Once set, the old address sends the learner there instead of showing the app.
   */
  getMigratedTo(): Promise<string | null>;
  setMigratedTo(origin: string): Promise<void>;
}
