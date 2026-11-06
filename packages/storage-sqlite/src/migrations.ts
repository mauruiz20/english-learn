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
  // 2 → 3: the append-only progress event log (the tables above become a cache of its fold) and
  // sync bookkeeping (device id, server cursor). The baseline event for progress written before
  // this version is added by `ensureBaseline`, which needs app knowledge (lessons).
  `
  CREATE TABLE event (
    id TEXT PRIMARY KEY NOT NULL,
    device_id TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    local_date TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    synced_at INTEGER,
    server_seq INTEGER
  );
  CREATE INDEX event_by_order ON event (local_date, occurred_at, id);
  CREATE INDEX event_by_synced ON event (synced_at, occurred_at, id);
  CREATE TABLE sync_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  // 3 → 4: cache of each lesson's best result (the fold's `lessonResults`). It starts empty on an
  // upgraded database: the caller refolds after an upgrade (see `migrate`'s result).
  `
  CREATE TABLE lesson_result (
    lesson_id TEXT PRIMARY KEY NOT NULL,
    best_accuracy REAL NOT NULL,
    completions INTEGER NOT NULL
  );
  `,
  // 4 → 5: the fold's state after the whole log (`FoldSnapshot` JSON), how many events it
  // covers and the fold rules it was computed with (`foldRulesFingerprint`), so a write applies
  // only its new events. It starts empty: the next write (or the refold after an upgrade) fills it.
  `
  CREATE TABLE fold_snapshot (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    event_count INTEGER NOT NULL,
    rules TEXT NOT NULL,
    data TEXT NOT NULL
  );
  `,
  // 5 → 6: cache of the fold's plumas, purchases and equips (`ProgressState.rewards`, JSON), read
  // with the totals of every write. It starts empty: the refold after an upgrade fills it.
  `
  CREATE TABLE rewards (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL
  );
  `,
  // 6 → 7: plumas and Avi's wardrobe were withdrawn. Their cache (a pure derivation of the event
  // log, nothing else reads it) and the one-time plumas note go; the events stay in the log.
  `
  DROP TABLE IF EXISTS rewards;
  DELETE FROM setting WHERE key = 'plumas_welcome';
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
 * are skipped. Each migration and its version bump run in one transaction. Resolves to the
 * version the database had before: below `SCHEMA_VERSION` means it was upgraded, and cache
 * tables a migration added must be refilled from the event log (`rebuildFromEvents`).
 */
export async function migrate(db: SqlDatabase): Promise<number> {
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
  return current;
}
