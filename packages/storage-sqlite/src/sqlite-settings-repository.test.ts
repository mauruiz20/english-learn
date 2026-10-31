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

  it("has not dismissed the word lookup hint by default", async () => {
    expect(await settings.getLookupHintDismissed()).toBe(false);
  });

  it("remembers that the word lookup hint was dismissed", async () => {
    await settings.setLookupHintDismissed();

    expect(await settings.getLookupHintDismissed()).toBe(true);
    expect(await createSqliteSettingsRepository(db).getLookupHintDismissed()).toBe(true);
  });

  it("has no signed-in account by default", async () => {
    expect(await settings.getAccount()).toBeNull();
  });

  it("remembers the signed-in account (id and email only) until it is cleared", async () => {
    await settings.setAccount({ userId: "user-1", email: "ana@example.com" });

    expect(await createSqliteSettingsRepository(db).getAccount()).toEqual({
      userId: "user-1",
      email: "ana@example.com",
    });

    await settings.clearAccount();
    expect(await settings.getAccount()).toBeNull();
  });

  it("treats an unreadable stored account as signed out", async () => {
    await db.runAsync("INSERT INTO setting (key, value) VALUES ('account', '{oops')", []);

    expect(await settings.getAccount()).toBeNull();
  });

  it("remembers that the save-progress suggestion was dismissed", async () => {
    expect(await settings.getSaveProgressSuggestionDismissed()).toBe(false);

    await settings.setSaveProgressSuggestionDismissed();

    expect(await createSqliteSettingsRepository(db).getSaveProgressSuggestionDismissed()).toBe(
      true,
    );
  });
});
