import { Appearance, Platform } from "react-native";
import {
  createThemePreferenceStore,
  nativeColorScheme,
  readCachedThemePreference,
  writeCachedThemePreference,
  type StorageAccess,
} from "./theme-preference";

/** localStorage on web; nothing on native (the settings repository is read at start instead). */
const webStorage: StorageAccess = () =>
  Platform.OS === "web" && typeof window !== "undefined" ? window.localStorage : undefined;

/**
 * The app's theme preference. Web starts from the localStorage cache (the same value the page's
 * boot script applied before the first paint); native starts at "system". Either way the stored
 * setting replaces it once read (see `ThemePreferenceProvider`). Every change is mirrored to the
 * web cache, or applied as the native appearance override (status bar, system UI, `useColorScheme`).
 */
export const appThemePreferenceStore = createThemePreferenceStore(
  readCachedThemePreference(webStorage),
  (preference) => {
    if (Platform.OS === "web") writeCachedThemePreference(webStorage, preference);
    else Appearance.setColorScheme(nativeColorScheme(preference));
  },
);
