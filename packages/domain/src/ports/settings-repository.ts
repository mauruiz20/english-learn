import type { Level } from "../cefr";
import type { DailyGoal } from "../daily-goal";
import type { LocalDate } from "../local-date";

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

/** The app's look: follow the device's light/dark setting, or always one of them. */
export type ThemePreference = "system" | "light" | "dark";

/** How fast English is spoken by the pronunciation buttons: the voice's normal speed, or slow. */
export type SpeechRate = "normal" | "slow";

/** The learner's app preferences, kept on the device. Implemented by the app layer. */
export interface SettingsRepository {
  /** Whether interaction sounds play; on until the learner turns them off. */
  getSoundEnabled(): Promise<boolean>;
  setSoundEnabled(enabled: boolean): Promise<void>;
  /** Whether the "Escuchar" pronunciation buttons show; on until the learner turns them off. */
  getPronunciationEnabled(): Promise<boolean>;
  setPronunciationEnabled(enabled: boolean): Promise<void>;
  /** The speed pronunciation plays at; normal until the learner picks slow. */
  getSpeechRate(): Promise<SpeechRate>;
  setSpeechRate(rate: SpeechRate): Promise<void>;
  /**
   * The English voice picked on this device (its `voiceURI`), or null for the automatic one.
   * Device only: voices differ between devices.
   */
  getSpeechVoice(): Promise<string | null>;
  /** Picks the voice; null goes back to the automatic one. */
  setSpeechVoice(voiceId: string | null): Promise<void>;
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
  /**
   * The level the home path shows, picked by hand on this device; null follows the automatic
   * level. A view preference only, never part of the progress.
   */
  getPathLevel(): Promise<Level | null>;
  /** Picks the path's level; null goes back to the automatic one. */
  setPathLevel(level: Level | null): Promise<void>;
  /** Forgets it (a sign-out that deletes this device's progress): the next learner picks anew. */
  clearPathLevel(): Promise<void>;
  /**
   * The levels whose intro ("Al terminar este nivel podrás…") the path already showed on this
   * device, in CEFR order: each shows once. Device only, never part of the progress.
   */
  getSeenLevelIntros(): Promise<readonly Level[]>;
  markLevelIntroSeen(level: Level): Promise<void>;
  /** Forgets them (a sign-out that deletes this device's progress): the next learner sees them. */
  clearSeenLevelIntros(): Promise<void>;
  /**
   * The date home was last opened on this device, or null before the first visit: Avi says
   * "welcome back" on the first visit of a new day. Device only, never synced.
   */
  getLastHomeVisit(): Promise<LocalDate | null>;
  setLastHomeVisit(date: LocalDate): Promise<void>;
  /**
   * How many exercises a day the learner aims for; "normal" (20) until they pick another (an
   * unreadable value reads as the default). Device only, never part of the progress.
   */
  getDailyGoal(): Promise<DailyGoal>;
  setDailyGoal(goal: DailyGoal): Promise<void>;
  /** Whether the one-time "pick your daily goal" note on home was answered or closed. */
  getDailyGoalPromptDismissed(): Promise<boolean>;
  setDailyGoalPromptDismissed(): Promise<void>;
}
