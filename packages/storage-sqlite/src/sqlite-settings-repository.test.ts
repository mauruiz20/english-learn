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

  it("has pronunciation on at normal speed by default", async () => {
    expect(await settings.getPronunciationEnabled()).toBe(true);
    expect(await settings.getSpeechRate()).toBe("normal");
  });

  it("remembers that pronunciation was turned off, and back on", async () => {
    await settings.setPronunciationEnabled(false);
    expect(await createSqliteSettingsRepository(db).getPronunciationEnabled()).toBe(false);

    await settings.setPronunciationEnabled(true);
    expect(await settings.getPronunciationEnabled()).toBe(true);
  });

  it("remembers the speech rate, and reads an unknown one as normal", async () => {
    await settings.setSpeechRate("slow");
    expect(await createSqliteSettingsRepository(db).getSpeechRate()).toBe("slow");

    await db.runAsync("UPDATE setting SET value = 'turbo' WHERE key = 'speech_rate'", []);
    expect(await settings.getSpeechRate()).toBe("normal");
  });

  it("speaks with the automatic voice by default, remembers a picked one and forgets it", async () => {
    expect(await settings.getSpeechVoice()).toBeNull();

    await settings.setSpeechVoice("com.apple.voice.compact.en-US.Samantha");
    expect(await createSqliteSettingsRepository(db).getSpeechVoice()).toBe(
      "com.apple.voice.compact.en-US.Samantha",
    );

    await settings.setSpeechVoice(null);
    expect(await createSqliteSettingsRepository(db).getSpeechVoice()).toBeNull();
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

  it("remembers which level intros this device has seen, until a full sign-out", async () => {
    expect(await settings.getSeenLevelIntros()).toEqual([]);

    await settings.markLevelIntroSeen("A2");
    await settings.markLevelIntroSeen("A1");
    await settings.markLevelIntroSeen("A2");
    expect(await createSqliteSettingsRepository(db).getSeenLevelIntros()).toEqual(["A1", "A2"]);

    await settings.clearSeenLevelIntros();
    expect(await settings.getSeenLevelIntros()).toEqual([]);
  });

  it("ignores unreadable seen level intros", async () => {
    await db.runAsync(
      "INSERT INTO setting (key, value) VALUES ('seen_level_intros', 'B1,Z9,,a2')",
      [],
    );

    expect(await settings.getSeenLevelIntros()).toEqual(["B1"]);
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

  it("aims for the normal daily goal until the learner picks another", async () => {
    expect(await settings.getDailyGoal()).toBe("normal");

    await settings.setDailyGoal("intense");
    expect(await createSqliteSettingsRepository(db).getDailyGoal()).toBe("intense");

    await settings.setDailyGoal("off");
    expect(await createSqliteSettingsRepository(db).getDailyGoal()).toBe("off");
  });

  it("treats an unreadable daily goal as the default", async () => {
    await db.runAsync("INSERT INTO setting (key, value) VALUES ('daily_goal', '20')", []);

    expect(await settings.getDailyGoal()).toBe("normal");
  });

  it("remembers that the daily goal note was answered", async () => {
    expect(await settings.getDailyGoalPromptDismissed()).toBe(false);

    await settings.setDailyGoalPromptDismissed();

    expect(await createSqliteSettingsRepository(db).getDailyGoalPromptDismissed()).toBe(true);
  });
});
