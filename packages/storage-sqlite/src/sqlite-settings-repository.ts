import type { SettingsRepository } from "@english-learn/domain";
import type { SqlDatabase } from "./sql-database";

const SOUND_ENABLED = "sound_enabled";

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
  };
}
