import type { SettingsRepository } from "@english-learn/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "./migrations";
import { createSqliteSettingsRepository } from "./sqlite-settings-repository";
import { createNodeSqliteDatabase } from "./testing/node-sqlite-database";

describe("createSqliteSettingsRepository", () => {
  let db: ReturnType<typeof createNodeSqliteDatabase>;
  let settings: SettingsRepository;

  beforeEach(async () => {
    db = createNodeSqliteDatabase();
    await migrate(db);
    settings = createSqliteSettingsRepository(db);
  });
  afterEach(() => db.close());

  it("has sounds on by default", async () => {
    expect(await settings.getSoundEnabled()).toBe(true);
  });

  it("remembers that sounds were turned off, and back on", async () => {
    await settings.setSoundEnabled(false);
    expect(await settings.getSoundEnabled()).toBe(false);
    expect(await createSqliteSettingsRepository(db).getSoundEnabled()).toBe(false);

    await settings.setSoundEnabled(true);
    expect(await settings.getSoundEnabled()).toBe(true);
  });

  it("treats an unreadable stored value as the default", async () => {
    await db.runAsync("INSERT INTO setting (key, value) VALUES ('sound_enabled', 'maybe')", []);

    expect(await settings.getSoundEnabled()).toBe(true);
  });
});
