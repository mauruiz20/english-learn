import type { Level } from "../cefr";

/**
 * The account this device is signed in to, as remembered across restarts: who, never a token
 * (the session itself lives in an HttpOnly cookie and an in-memory access token).
 */
export type AccountMarker = {
  readonly userId: string;
  readonly email: string;
  /**
   * The learner's first name from Google's ID token, for the home greeting. Device only (never
   * sent to or stored by the API); missing for accounts remembered before it existed, until the
   * next sign-in.
   */
  readonly givenName?: string;
};

/**
 * The one-time note for the plumas earned by study done before plumas existed ("Avi te guardó N
 * plumas…"): the amount decided on the first home visit, and whether the learner dismissed it.
 */
export type PlumasWelcome = { readonly plumas: number; readonly dismissed: boolean };

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
  /** The plumas welcome note, or null before the first home visit with plumas decided it. */
  getPlumasWelcome(): Promise<PlumasWelcome | null>;
  setPlumasWelcome(note: PlumasWelcome): Promise<void>;
  /** Forgets it (a sign-out that deletes this device's progress): the next learner decides anew. */
  clearPlumasWelcome(): Promise<void>;
  /**
   * The level the home path shows, picked by hand on this device; null follows the automatic
   * level. A view preference only, never part of the progress.
   */
  getPathLevel(): Promise<Level | null>;
  /** Picks the path's level; null goes back to the automatic one. */
  setPathLevel(level: Level | null): Promise<void>;
  /** Forgets it (a sign-out that deletes this device's progress), like `clearPlumasWelcome`. */
  clearPathLevel(): Promise<void>;
}
