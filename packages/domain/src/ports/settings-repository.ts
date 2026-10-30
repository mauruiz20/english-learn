/** The learner's app preferences, kept on the device. Implemented by the app layer. */
export interface SettingsRepository {
  /** Whether interaction sounds play; on until the learner turns them off. */
  getSoundEnabled(): Promise<boolean>;
  setSoundEnabled(enabled: boolean): Promise<void>;
  /** Whether the learner dismissed the one-time "tap a word" hint of the word lookup. */
  getLookupHintDismissed(): Promise<boolean>;
  setLookupHintDismissed(): Promise<void>;
}
