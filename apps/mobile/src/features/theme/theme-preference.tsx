import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { useAppServices } from "@/infrastructure/services/app-services";
import { nextThemePreference, type ThemePreference } from "@/shared/ui/theme-preference";
import { useThemePreferenceStore, useThemePreferenceValue } from "@/shared/ui/use-theme";

type ThemePreferenceControl = {
  /** Sistema, Claro or Oscuro. */
  readonly preference: ThemePreference;
  /** Picks the next one (Sistema → Claro → Oscuro → Sistema), shows it and saves it. */
  readonly cycle: () => void;
};

const ThemePreferenceContext = createContext<ThemePreferenceControl | null>(null);

/**
 * Connects the app's theme preference (what `useTheme` renders with) to the settings repository,
 * the source of truth: reads the stored choice once and applies it, then saves every change.
 * Holds the screens back until the stored choice is known (one quick read), so they never show
 * the other scheme first; a failed read shows them with the current preference.
 */
export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const { settingsRepository } = useAppServices();
  const store = useThemePreferenceStore();
  const preference = useThemePreferenceValue();
  const [loaded, setLoaded] = useState(false);
  // A choice made before the stored one is read wins over it.
  const touched = useRef(false);

  useEffect(() => {
    let active = true;
    settingsRepository.getThemePreference().then(
      (stored) => {
        if (!active) return;
        if (!touched.current) store.set(stored);
        setLoaded(true);
      },
      (error: unknown) => {
        console.warn("Failed to read the theme setting", error);
        if (active) setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, [settingsRepository, store]);

  const cycle = () => {
    touched.current = true;
    const next = nextThemePreference(store.get());
    store.set(next);
    settingsRepository
      .setThemePreference(next)
      .catch((error: unknown) => console.warn("Failed to save the theme setting", error));
  };

  if (!loaded) return null;
  return <ThemePreferenceContext value={{ preference, cycle }}>{children}</ThemePreferenceContext>;
}

export function useThemePreference(): ThemePreferenceControl {
  const control = use(ThemePreferenceContext);
  if (control === null) {
    throw new Error("useThemePreference must be used inside <ThemePreferenceProvider>");
  }
  return control;
}
