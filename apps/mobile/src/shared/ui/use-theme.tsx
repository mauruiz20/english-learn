import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { themeFor, type ColorScheme, type Theme } from "./theme";
import { appThemePreferenceStore } from "./app-theme-preference";
import { resolveScheme, type ThemePreference, type ThemePreferenceStore } from "./theme-preference";

const SchemeOverride = createContext<ColorScheme | null>(null);
const PreferenceStore = createContext<ThemePreferenceStore>(appThemePreferenceStore);

/** The app-wide theme preference store (tests pass their own with `ThemePreferenceStoreProvider`). */
export function useThemePreferenceStore(): ThemePreferenceStore {
  return useContext(PreferenceStore);
}

/** The learner's current theme preference ("system" until the stored one is known). */
export function useThemePreferenceValue(): ThemePreference {
  const store = useThemePreferenceStore();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * The theme the app shows: the learner's preference, resolved against the system color scheme
 * when it is "system" (and kept up to date when the system scheme changes), or the nearest
 * `ThemeOverride`.
 */
export function useTheme(): Theme {
  const system = useColorScheme();
  const preference = useThemePreferenceValue();
  const override = useContext(SchemeOverride);
  return themeFor(override ?? resolveScheme(preference, system));
}

/** Gives a subtree its own preference store (tests). */
export function ThemePreferenceStoreProvider({
  store,
  children,
}: {
  store: ThemePreferenceStore;
  children: ReactNode;
}) {
  return <PreferenceStore.Provider value={store}>{children}</PreferenceStore.Provider>;
}

/**
 * Forces a scheme for its subtree, e.g. the sticky note is always yellow paper with dark ink,
 * whatever the system scheme.
 */
export function ThemeOverride({ scheme, children }: { scheme: ColorScheme; children: ReactNode }) {
  return <SchemeOverride.Provider value={scheme}>{children}</SchemeOverride.Provider>;
}

/**
 * Builds a `useStyles` hook from a style factory; styles are created once per scheme.
 * Usage: `const useStyles = themedStyles((t) => StyleSheet.create({...}))`.
 */
export function themedStyles<T>(factory: (theme: Theme) => T): () => T {
  const cache = new Map<ColorScheme, T>();
  return function useStyles() {
    const theme = useTheme();
    const cached = cache.get(theme.scheme);
    if (cached !== undefined) return cached;
    const styles = factory(theme);
    cache.set(theme.scheme, styles);
    return styles;
  };
}
