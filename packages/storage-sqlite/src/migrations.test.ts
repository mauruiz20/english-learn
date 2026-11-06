import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, SchemaTooNewError, migrate } from "./migrations";
import { createNodeSqliteDatabase } from "./testing/node-sqlite-database";

type Db = ReturnType<typeof createNodeSqliteDatabase>;

async function userVersion(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []);
  return row?.user_version ?? -1;
}

async function tableNames(db: Db): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    [],
  );
  return rows.map((row) => row.name);
}

describe("migrate", () => {
  let db: Db;
  beforeEach(() => {
    db = createNodeSqliteDatabase();
  });
  afterEach(() => db.close());

  it("creates the schema on a fresh database and records the version", async () => {
    await migrate(db);

    expect(await userVersion(db)).toBe(SCHEMA_VERSION);
    expect(await tableNames(db)).toEqual([
      "daily_exercises",
      "event",
      "fold_snapshot",
      "item_history",
      "lesson_result",
      "placement_result",
      "review_state",
      "setting",
      "streak",
      "sync_state",
      "xp",
    ]);
  });

  it("is idempotent and keeps existing data", async () => {
    await migrate(db);
    await db.runAsync("INSERT INTO xp (id, total) VALUES (1, ?)", [42]);

    await migrate(db);
    await migrate(db);

    expect(await userVersion(db)).toBe(SCHEMA_VERSION);
    const row = await db.getFirstAsync<{ total: number }>("SELECT total FROM xp", []);
    expect(row?.total).toBe(42);
  });

  it("upgrades a version 1 database without touching its progress", async () => {
    await db.execAsync(
      "CREATE TABLE xp (id INTEGER PRIMARY KEY CHECK (id = 1), total INTEGER NOT NULL)",
    );
    await db.execAsync(`CREATE TABLE review_state (item_id TEXT PRIMARY KEY NOT NULL, ease REAL NOT NULL,
      interval_days INTEGER NOT NULL, reps INTEGER NOT NULL, lapses INTEGER NOT NULL, due_date TEXT NOT NULL);
      CREATE TABLE streak (id INTEGER PRIMARY KEY CHECK (id = 1), current INTEGER NOT NULL,
      longest INTEGER NOT NULL, last_active_date TEXT);
      CREATE TABLE placement_result (id INTEGER PRIMARY KEY CHECK (id = 1), level TEXT NOT NULL,
      theta REAL NOT NULL);`);
    await db.runAsync("INSERT INTO xp (id, total) VALUES (1, ?)", [7]);
    await db.execAsync("PRAGMA user_version = 1");

    await migrate(db);

    expect(await userVersion(db)).toBe(SCHEMA_VERSION);
    expect(await tableNames(db)).toContain("setting");
    const row = await db.getFirstAsync<{ total: number }>("SELECT total FROM xp", []);
    expect(row?.total).toBe(7);
  });

  it("adds the event log with its indexes at version 3", async () => {
    await migrate(db);

    const columns = await db.getAllAsync<{ name: string; type: string; notnull: number }>(
      "SELECT name, type, \"notnull\" FROM pragma_table_info('event') ORDER BY cid",
      [],
    );
    expect(columns).toEqual([
      { name: "id", type: "TEXT", notnull: 1 },
      { name: "device_id", type: "TEXT", notnull: 1 },
      { name: "occurred_at", type: "INTEGER", notnull: 1 },
      { name: "local_date", type: "TEXT", notnull: 1 },
      { name: "type", type: "TEXT", notnull: 1 },
      { name: "payload", type: "TEXT", notnull: 1 },
      { name: "synced_at", type: "INTEGER", notnull: 0 },
      { name: "server_seq", type: "INTEGER", notnull: 0 },
    ]);
    const indexes = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'event' AND sql IS NOT NULL ORDER BY name",
      [],
    );
    expect(indexes.map((i) => i.name)).toEqual(["event_by_order", "event_by_synced"]);
  });

  it("resolves to the version it found, so the caller knows the schema was upgraded", async () => {
    expect(await migrate(db)).toBe(0);
    expect(await migrate(db)).toBe(SCHEMA_VERSION);
  });

  it("adds the lesson result cache at version 4", async () => {
    await migrate(db);
    const columns = await db.getAllAsync<{ name: string; type: string; notnull: number }>(
      "SELECT name, type, \"notnull\" FROM pragma_table_info('lesson_result') ORDER BY cid",
      [],
    );
    expect(columns).toEqual([
      { name: "lesson_id", type: "TEXT", notnull: 1 },
      { name: "best_accuracy", type: "REAL", notnull: 1 },
      { name: "completions", type: "INTEGER", notnull: 1 },
    ]);
  });

  it("adds the item history cache at version 8", async () => {
    await migrate(db);
    const columns = await db.getAllAsync<{ name: string; type: string; notnull: number }>(
      "SELECT name, type, \"notnull\" FROM pragma_table_info('item_history') ORDER BY cid",
      [],
    );
    expect(columns).toEqual([
      { name: "item_id", type: "TEXT", notnull: 1 },
      { name: "last_seen", type: "TEXT", notnull: 1 },
      { name: "last_lapse", type: "TEXT", notnull: 0 },
      { name: "recent_grades", type: "TEXT", notnull: 1 },
    ]);
  });

  it("adds the daily exercises cache at version 9", async () => {
    await migrate(db);
    const columns = await db.getAllAsync<{ name: string; type: string; notnull: number }>(
      "SELECT name, type, \"notnull\" FROM pragma_table_info('daily_exercises') ORDER BY cid",
      [],
    );
    expect(columns).toEqual([
      { name: "local_date", type: "TEXT", notnull: 1 },
      { name: "exercises", type: "INTEGER", notnull: 1 },
    ]);
  });

  it("drops the plumas cache and the plumas note at version 7, keeping the rest", async () => {
    await migrate(db);
    // A version 6 database, as the app with Avi's wardrobe left it.
    await db.execAsync(`
      CREATE TABLE rewards (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
      INSERT INTO rewards (id, data) VALUES (1, '{"balance":135}');
      INSERT INTO setting (key, value) VALUES ('plumas_welcome', '{"plumas":135,"dismissed":true}');
      INSERT INTO setting (key, value) VALUES ('sound_enabled', 'false');
      INSERT INTO xp (id, total) VALUES (1, 42);
      DROP TABLE item_history;
      DROP TABLE daily_exercises;
      PRAGMA user_version = 6;
    `);

    expect(await migrate(db)).toBe(6);

    expect(await userVersion(db)).toBe(SCHEMA_VERSION);
    expect(await tableNames(db)).not.toContain("rewards");
    const settings = await db.getAllAsync<{ key: string }>("SELECT key FROM setting", []);
    expect(settings.map((row) => row.key)).toEqual(["sound_enabled"]);
    const row = await db.getFirstAsync<{ total: number }>("SELECT total FROM xp", []);
    expect(row?.total).toBe(42);
  });

  it("refuses a database created by a newer app version", async () => {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);

    await expect(migrate(db)).rejects.toThrow(/newer/);
    await expect(migrate(db)).rejects.toBeInstanceOf(SchemaTooNewError);
    await expect(migrate(db)).rejects.toMatchObject({
      databaseVersion: SCHEMA_VERSION + 1,
      supportedVersion: SCHEMA_VERSION,
    });
  });
});
