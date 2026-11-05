import { localDate, type SettingsRepository } from "@english-learn/domain";
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

  it("remembers the first name for the greeting with the account, and forgets it with it", async () => {
    await settings.setAccount({ userId: "user-1", email: "ana@example.com", givenName: "Inés" });

    expect(await createSqliteSettingsRepository(db).getAccount()).toEqual({
      userId: "user-1",
      email: "ana@example.com",
      givenName: "Inés",
    });

    // Another account replaces it whole: no name left over from the previous one.
    await settings.setAccount({ userId: "user-2", email: "bo@example.com" });
    expect(await settings.getAccount()).toEqual({ userId: "user-2", email: "bo@example.com" });

    await settings.setAccount({ userId: "user-1", email: "ana@example.com", givenName: "Inés" });
    await settings.clearAccount();
    const rows = await db.getAllAsync<{ value: string }>("SELECT value FROM setting", []);
    expect(rows.some((row) => row.value.includes("Inés"))).toBe(false);
  });

  it("reads an account stored before names (no name) and ignores an unreadable name", async () => {
    await db.runAsync(
      `INSERT INTO setting (key, value) VALUES ('account', '{"userId":"u","email":"e@x.com","givenName":7}')`,
      [],
    );

    expect(await settings.getAccount()).toEqual({ userId: "u", email: "e@x.com" });
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

  it("follows the system theme by default", async () => {
    expect(await settings.getThemePreference()).toBe("system");
  });

  it.each(["light", "dark", "system"] as const)(
    "remembers the %s theme preference",
    async (preference) => {
      await settings.setThemePreference(preference);

      expect(await createSqliteSettingsRepository(db).getThemePreference()).toBe(preference);
    },
  );

  it("treats an unreadable stored theme as following the system", async () => {
    await db.runAsync("INSERT INTO setting (key, value) VALUES ('theme_preference', 'sepia')", []);

    expect(await settings.getThemePreference()).toBe("system");
  });

  it("remembers the origin this device's progress moved to", async () => {
    expect(await settings.getMigratedTo()).toBeNull();

    await settings.setMigratedTo("https://english.maumar.com.ar");

    expect(await createSqliteSettingsRepository(db).getMigratedTo()).toBe(
      "https://english.maumar.com.ar",
    );
  });

  it("remembers the plumas welcome note and its dismissal", async () => {
    expect(await settings.getPlumasWelcome()).toBeNull();

    await settings.setPlumasWelcome({ plumas: 135, dismissed: false });
    expect(await createSqliteSettingsRepository(db).getPlumasWelcome()).toEqual({
      plumas: 135,
      dismissed: false,
    });

    await settings.setPlumasWelcome({ plumas: 135, dismissed: true });
    expect(await settings.getPlumasWelcome()).toEqual({ plumas: 135, dismissed: true });
  });

  it("forgets the plumas welcome note (a sign-out that deletes this device's progress)", async () => {
    await settings.setPlumasWelcome({ plumas: 135, dismissed: true });

    await settings.clearPlumasWelcome();

    expect(await createSqliteSettingsRepository(db).getPlumasWelcome()).toBeNull();
  });

  it("treats an unreadable plumas welcome note as dismissed (never shown twice)", async () => {
    await db.runAsync("INSERT INTO setting (key, value) VALUES ('plumas_welcome', '{')", []);

    expect(await settings.getPlumasWelcome()).toEqual({ plumas: 0, dismissed: true });
  });
  it("follows the automatic path level until the learner picks one", async () => {
    expect(await settings.getPathLevel()).toBeNull();

    await settings.setPathLevel("B2");
    expect(await createSqliteSettingsRepository(db).getPathLevel()).toBe("B2");

    await settings.setPathLevel("A2");
    expect(await settings.getPathLevel()).toBe("A2");
  });

  it("goes back to the automatic path level, also on a full sign-out", async () => {
    await settings.setPathLevel("B1");
    await settings.setPathLevel(null);
    expect(await settings.getPathLevel()).toBeNull();

    await settings.setPathLevel("B1");
    await settings.clearPathLevel();
    expect(await createSqliteSettingsRepository(db).getPathLevel()).toBeNull();
  });

  it("treats an unreadable path level as automatic", async () => {
    await db.runAsync("INSERT INTO setting (key, value) VALUES ('path_level', 'Z9')", []);

    expect(await settings.getPathLevel()).toBeNull();
  });

  it("remembers the last home visit (per device, for Avi's welcome back)", async () => {
    expect(await settings.getLastHomeVisit()).toBeNull();

    await settings.setLastHomeVisit(localDate("2026-11-05"));

    expect(await createSqliteSettingsRepository(db).getLastHomeVisit()).toBe("2026-11-05");
  });

  it("treats an unreadable last home visit as none", async () => {
    await db.runAsync("INSERT INTO setting (key, value) VALUES ('last_home_visit', 'ayer')", []);

    expect(await settings.getLastHomeVisit()).toBeNull();
  });
});
