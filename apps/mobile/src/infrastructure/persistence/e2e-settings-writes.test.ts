import type { SettingsRepository } from "@english-learn/domain";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { exposeSettingsWrites } from "./e2e-settings-writes";

type Host = { __e2e?: { settingsWritesSettled?: () => Promise<void> } };
const host = globalThis as unknown as Host;

/** Makes `setSoundEnabled` wait until `commit()` is called. */
function withSlowSoundWrite(repository: SettingsRepository) {
  const set = repository.setSoundEnabled.bind(repository);
  let commit: () => void = () => {};
  repository.setSoundEnabled = (enabled) =>
    new Promise((resolve, reject) => {
      commit = () => set(enabled).then(resolve, reject);
    });
  return { commit: () => commit() };
}

describe("exposeSettingsWrites", () => {
  afterEach(() => {
    delete host.__e2e;
  });

  it("settles only once the settings writes in flight have committed", async () => {
    const fake = createFakeSettingsRepository();
    const slow = withSlowSoundWrite(fake);
    const settings = exposeSettingsWrites(fake);

    const write = settings.setSoundEnabled(false);
    let settled = false;
    const waiting = host.__e2e!.settingsWritesSettled!().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    slow.commit();
    await write;
    await waiting;
    expect(settled).toBe(true);
    expect(await fake.getSoundEnabled()).toBe(false);
  });

  it("settles right away with no writes in flight, and after a failed write", async () => {
    const fake = createFakeSettingsRepository();
    fake.setLookupHintDismissed = () => Promise.reject(new Error("disk full"));
    const settings = exposeSettingsWrites(fake);

    await expect(host.__e2e!.settingsWritesSettled!()).resolves.toBeUndefined();
    await expect(settings.setLookupHintDismissed()).rejects.toThrow("disk full");
    await expect(host.__e2e!.settingsWritesSettled!()).resolves.toBeUndefined();
  });

  it("tracks the theme preference writes too", async () => {
    const fake = createFakeSettingsRepository();
    let commit: () => void = () => {};
    fake.setThemePreference = () =>
      new Promise<void>((resolve) => {
        commit = resolve;
      });
    const settings = exposeSettingsWrites(fake);

    const write = settings.setThemePreference("dark");
    let settled = false;
    const waiting = host.__e2e!.settingsWritesSettled!().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    commit();
    await write;
    await waiting;
    expect(settled).toBe(true);
  });

  it("passes reads through unchanged", async () => {
    const fake = createFakeSettingsRepository();
    await fake.setSoundEnabled(false);
    const settings = exposeSettingsWrites(fake);
    expect(await settings.getSoundEnabled()).toBe(false);
    expect(await settings.getLookupHintDismissed()).toBe(false);
    expect(await settings.getThemePreference()).toBe("system");
  });
});
