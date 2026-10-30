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
      "placement_result",
      "review_state",
      "setting",
      "streak",
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
