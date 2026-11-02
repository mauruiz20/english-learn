import type { SettingsRepository } from "@english-learn/domain";

/**
 * TEST-ONLY. `repository` whose writes are tracked so `window.__e2e.settingsWritesSettled()`
 * resolves once every settings write in flight has committed (or failed). The switches save in
 * the background, so a spec that reloads right after toggling one waits for this first instead
 * of racing the write. Wired in only when the web build is exported with `EXPO_PUBLIC_E2E=1`
 * (see `sqlite-app-services.tsx`); never in production.
 */
export function exposeSettingsWrites(repository: SettingsRepository): SettingsRepository {
  const pending = new Set<Promise<void>>();

  const track = (promise: Promise<void>): Promise<void> => {
    const settled = promise.then(
      () => undefined,
      () => undefined,
    );
    pending.add(settled);
    void settled.then(() => pending.delete(settled));
    return promise;
  };

  const host = globalThis as unknown as {
    __e2e?: { settingsWritesSettled?: () => Promise<void> };
  };
  host.__e2e ??= {};
  host.__e2e.settingsWritesSettled = async () => {
    await Promise.all(pending);
  };

  return {
    getSoundEnabled: () => repository.getSoundEnabled(),
    setSoundEnabled: (enabled) => track(repository.setSoundEnabled(enabled)),
    getLookupHintDismissed: () => repository.getLookupHintDismissed(),
    setLookupHintDismissed: () => track(repository.setLookupHintDismissed()),
    getAccount: () => repository.getAccount(),
    setAccount: (account) => track(repository.setAccount(account)),
    clearAccount: () => track(repository.clearAccount()),
    getSaveProgressSuggestionDismissed: () => repository.getSaveProgressSuggestionDismissed(),
    setSaveProgressSuggestionDismissed: () =>
      track(repository.setSaveProgressSuggestionDismissed()),
    getThemePreference: () => repository.getThemePreference(),
    setThemePreference: (preference) => track(repository.setThemePreference(preference)),
    getMigratedTo: () => repository.getMigratedTo(),
    setMigratedTo: (origin) => track(repository.setMigratedTo(origin)),
  };
}
