import type { ColorScheme } from "./theme";

/**
 * The learner's theme choice: follow the device ("system", the default) or always light or dark.
 * Same values as the domain's `ThemePreference`, which the settings repository stores.
 */
export type ThemePreference = "system" | "light" | "dark";

/** How the choice reads in the UI. */
export const THEME_PREFERENCE_NAMES: Record<ThemePreference, string> = {
  system: "Sistema",
  light: "Claro",
  dark: "Oscuro",
};

const CYCLE: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

/** The scheme the app shows: the device's for "system" (light when unknown), else the choice. */
export function resolveScheme(
  preference: ThemePreference,
  system: string | null | undefined,
): ColorScheme {
  if (preference !== "system") return preference;
  return system === "dark" ? "dark" : "light";
}

/** What pressing the theme button picks next: Sistema → Claro → Oscuro → Sistema. */
export function nextThemePreference(preference: ThemePreference): ThemePreference {
  return CYCLE[preference];
}

/** The `Appearance.setColorScheme` value (React Native 0.88): "unspecified" clears the override. */
export function nativeColorScheme(preference: ThemePreference): "unspecified" | ColorScheme {
  return preference === "system" ? "unspecified" : preference;
}

/**
 * localStorage key of the web cache. `public/index.html`'s boot script reads it before the first
 * paint, so the page never flashes the other scheme; keep both in sync.
 */
export const THEME_STORAGE_KEY = "english-learn.theme";

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;
/** Returns the storage, or undefined (native); may throw (blocked site data). */
export type StorageAccess = () => KeyValueStorage | undefined;

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** The cached preference; "system" when nothing usable is cached or storage is unavailable. */
export function readCachedThemePreference(storage: StorageAccess): ThemePreference {
  try {
    const value = storage()?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : "system";
  } catch {
    return "system";
  }
}

/** Mirrors the preference into the cache; a blocked or full storage is ignored (SQLite has it). */
export function writeCachedThemePreference(
  storage: StorageAccess,
  preference: ThemePreference,
): void {
  try {
    storage()?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The cache only avoids a flash on the next load; the settings repository is the source.
  }
}

export type ThemePreferenceStore = {
  get(): ThemePreference;
  set(preference: ThemePreference): void;
  subscribe(listener: () => void): () => void;
};

/**
 * The preference the whole app renders with (read by `useTheme`). `apply` runs on every change
 * to carry it to the platform (web cache, native appearance override).
 */
export function createThemePreferenceStore(
  initial: ThemePreference,
  apply: (preference: ThemePreference) => void = () => {},
): ThemePreferenceStore {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(preference) {
      if (preference === current) return;
      current = preference;
      apply(preference);
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
