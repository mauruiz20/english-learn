import type { AccountMarker, SettingsRepository, ThemePreference } from "@english-learn/domain";
import type { SqlDatabase } from "./sql-database";

const SOUND_ENABLED = "sound_enabled";
const LOOKUP_HINT_DISMISSED = "lookup_hint_dismissed";
const ACCOUNT = "account";
const SAVE_PROGRESS_SUGGESTION_DISMISSED = "save_progress_suggestion_dismissed";
const THEME_PREFERENCE = "theme_preference";
const MIGRATED_TO = "migrated_to";

/** `SettingsRepository` over the `setting` key/value table. Call `migrate(db)` first. */
export function createSqliteSettingsRepository(db: SqlDatabase): SettingsRepository {
  async function read(key: string): Promise<string | null> {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM setting WHERE key = ?",
      [key],
    );
    return row?.value ?? null;
  }

  async function write(key: string, value: string): Promise<void> {
    await db.runAsync(
      `INSERT INTO setting (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  return {
    // Anything but an explicit "off" keeps the default (on).
    getSoundEnabled: async () => (await read(SOUND_ENABLED)) !== "0",
    setSoundEnabled: (enabled) => write(SOUND_ENABLED, enabled ? "1" : "0"),
    getLookupHintDismissed: async () => (await read(LOOKUP_HINT_DISMISSED)) === "1",
    setLookupHintDismissed: () => write(LOOKUP_HINT_DISMISSED, "1"),
    getAccount: async () => parseAccount(await read(ACCOUNT)),
    // Only who is signed in: tokens never reach the device's storage.
    setAccount: ({ userId, email }) => write(ACCOUNT, JSON.stringify({ userId, email })),
    clearAccount: async () => {
      await db.runAsync("DELETE FROM setting WHERE key = ?", [ACCOUNT]);
    },
    getSaveProgressSuggestionDismissed: async () =>
      (await read(SAVE_PROGRESS_SUGGESTION_DISMISSED)) === "1",
    setSaveProgressSuggestionDismissed: () => write(SAVE_PROGRESS_SUGGESTION_DISMISSED, "1"),
    getThemePreference: async () => parseThemePreference(await read(THEME_PREFERENCE)),
    setThemePreference: (preference) => write(THEME_PREFERENCE, preference),
    getMigratedTo: () => read(MIGRATED_TO),
    setMigratedTo: (origin) => write(MIGRATED_TO, origin),
  };
}

/** Anything but an explicit light or dark follows the system (the default). */
function parseThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/** An unreadable value counts as signed out: the learner signs in again. */
function parseAccount(value: string | null): AccountMarker | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { userId, email } = parsed as Record<string, unknown>;
    return typeof userId === "string" && typeof email === "string" ? { userId, email } : null;
  } catch {
    return null;
  }
}
