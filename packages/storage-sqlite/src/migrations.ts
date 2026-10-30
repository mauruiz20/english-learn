import type { SqlDatabase } from "./sql-database";

/**
 * Ordered schema migrations. Migration `i` upgrades the schema from version `i` to `i + 1`.
 * Never edit a released migration: append a new one instead.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE review_state (
    item_id TEXT PRIMARY KEY NOT NULL,
    ease REAL NOT NULL,
    interval_days INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    lapses INTEGER NOT NULL,
    due_date TEXT NOT NULL
  );
  CREATE TABLE streak (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current INTEGER NOT NULL,
    longest INTEGER NOT NULL,
    last_active_date TEXT
  );
  CREATE TABLE xp (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total INTEGER NOT NULL
  );
  CREATE TABLE placement_result (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    level TEXT NOT NULL,
    theta REAL NOT NULL
  );
  `,
  // 1 → 2: app preferences as key/value pairs (e.g. sound on/off).
  `
  CREATE TABLE setting (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

/** The schema version `migrate` brings a database to (stored in `PRAGMA user_version`). */
export const SCHEMA_VERSION = MIGRATIONS.length;

/** The on-device database was written by a newer app version; this one cannot read it. */
export class SchemaTooNewError extends Error {
  readonly databaseVersion: number;
  readonly supportedVersion: number;

  constructor(databaseVersion: number, supportedVersion: number) {
    super(
      `Database schema version ${databaseVersion} is newer than this app supports (${supportedVersion})`,
    );
    this.name = "SchemaTooNewError";
    this.databaseVersion = databaseVersion;
    this.supportedVersion = supportedVersion;
  }
}

/**
 * Brings the database schema up to `SCHEMA_VERSION`. Idempotent: already-applied migrations
 * are skipped. Each migration and its version bump run in one transaction.
 */
export async function migrate(db: SqlDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []);
  const current = row?.user_version ?? 0;

  if (current > SCHEMA_VERSION) {
    throw new SchemaTooNewError(current, SCHEMA_VERSION);
  }

  for (let version = current; version < SCHEMA_VERSION; version++) {
    const sql = MIGRATIONS[version];
    if (sql === undefined) throw new Error(`Missing migration ${version}`);
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
