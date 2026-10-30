import { createContext, useContext, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { themeFor, type ColorScheme, type Theme } from "./theme";

const SchemeOverride = createContext<ColorScheme | null>(null);

/** The theme for the system color scheme (or the nearest `ThemeOverride`). */
export function useTheme(): Theme {
  const system = useColorScheme();
  const override = useContext(SchemeOverride);
  return themeFor(override ?? system);
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
