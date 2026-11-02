import {
  THEME_PREFERENCE_NAMES,
  THEME_STORAGE_KEY,
  createThemePreferenceStore,
  nativeColorScheme,
  nextThemePreference,
  readCachedThemePreference,
  resolveScheme,
  writeCachedThemePreference,
  type ThemePreference,
} from "./theme-preference";

describe("resolveScheme", () => {
  it.each([
    ["system", "light", "light"],
    ["system", "dark", "dark"],
    ["system", null, "light"],
    ["system", undefined, "light"],
    ["light", "light", "light"],
    ["light", "dark", "light"],
    ["dark", "light", "dark"],
    ["dark", null, "dark"],
  ] as const)("%s preference with a %p system scheme shows %s", (preference, system, scheme) => {
    expect(resolveScheme(preference, system)).toBe(scheme);
  });
});

describe("nextThemePreference", () => {
  it("cycles Sistema → Claro → Oscuro → Sistema", () => {
    const seen: ThemePreference[] = ["system"];
    for (let i = 0; i < 3; i++) seen.push(nextThemePreference(seen.at(-1)!));
    expect(seen.map((preference) => THEME_PREFERENCE_NAMES[preference])).toEqual([
      "Sistema",
      "Claro",
      "Oscuro",
      "Sistema",
    ]);
  });
});

describe("nativeColorScheme", () => {
  it("clears the app's override to follow the system, or forces light or dark", () => {
    expect(nativeColorScheme("system")).toBe("unspecified");
    expect(nativeColorScheme("light")).toBe("light");
    expect(nativeColorScheme("dark")).toBe("dark");
  });
});

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

const throwing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("the theme cache (web localStorage)", () => {
  it("reads the cached preference", () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: "dark" });
    expect(readCachedThemePreference(() => storage)).toBe("dark");
  });

  it("follows the system with nothing cached, an unknown value or no storage", () => {
    expect(readCachedThemePreference(() => memoryStorage())).toBe("system");
    expect(readCachedThemePreference(() => memoryStorage({ [THEME_STORAGE_KEY]: "sepia" }))).toBe(
      "system",
    );
    expect(readCachedThemePreference(() => undefined)).toBe("system");
  });

  it("writes the preference under the key the page's boot script reads", () => {
    const storage = memoryStorage();
    writeCachedThemePreference(() => storage, "light");
    expect(storage.values.get(THEME_STORAGE_KEY)).toBe("light");
  });

  it("never throws when storage is blocked or full", () => {
    expect(readCachedThemePreference(() => throwing)).toBe("system");
    expect(() => writeCachedThemePreference(() => throwing, "dark")).not.toThrow();
    const getterThrows = () => {
      throw new Error("SecurityError");
    };
    expect(readCachedThemePreference(getterThrows)).toBe("system");
    expect(() => writeCachedThemePreference(getterThrows, "dark")).not.toThrow();
  });
});

describe("createThemePreferenceStore", () => {
  it("starts with the initial preference and tells listeners about changes", () => {
    const applied: ThemePreference[] = [];
    const store = createThemePreferenceStore("dark", (preference) => applied.push(preference));
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    expect(store.get()).toBe("dark");
    store.set("light");
    expect(store.get()).toBe("light");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(applied).toEqual(["light"]);

    unsubscribe();
    store.set("system");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the preference does not change", () => {
    const apply = jest.fn();
    const store = createThemePreferenceStore("system", apply);
    const listener = jest.fn();
    store.subscribe(listener);

    store.set("system");

    expect(listener).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
});
