import { localDate } from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { testRandomBytes } from "@/testing/random-bytes";
import { Text } from "@/shared/ui/text";
import { ThemeToggleButton } from "@/shared/ui/theme-toggle-button";
import {
  createThemePreferenceStore,
  type ThemePreference,
  type ThemePreferenceStore,
} from "@/shared/ui/theme-preference";
import { ThemePreferenceStoreProvider, useTheme } from "@/shared/ui/use-theme";
import { ThemePreferenceProvider, useThemePreference } from "./theme-preference";

let mockSystemScheme: "light" | "dark" | null = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockSystemScheme,
}));

afterEach(() => {
  mockSystemScheme = "light";
});

/** The home header's theme button, wired like the home screen wires it. */
function ThemeControl() {
  const { preference, cycle } = useThemePreference();
  return <ThemeToggleButton preference={preference} onCycle={cycle} />;
}

function PaperProbe() {
  const { scheme } = useTheme();
  return <Text>{`Hoja ${scheme}`}</Text>;
}

function renderControl({
  settings = createFakeSettingsRepository(),
  store = createThemePreferenceStore("system"),
}: {
  settings?: ReturnType<typeof createFakeSettingsRepository>;
  store?: ThemePreferenceStore;
} = {}) {
  const services = {
    progressRepository: createFakeRepository(),
    clock: { today: () => localDate("2026-10-29"), nowMs: () => 0 },
    random: () => 0,
    randomBytes: testRandomBytes,
    deviceId: "test-device",
    settingsRepository: settings,
    sounds: createFakeSoundPlayer(),
  };
  return render(
    <ThemePreferenceStoreProvider store={store}>
      <AppServicesProvider services={services}>
        <ThemePreferenceProvider>
          <ThemeControl />
          <PaperProbe />
        </ThemePreferenceProvider>
      </AppServicesProvider>
    </ThemePreferenceStoreProvider>,
  );
}

const themeButton = (name: string) =>
  screen.findByRole("button", { name: `Tema: ${name}. Cambiar tema` });

describe("ThemePreferenceProvider and the theme button", () => {
  it("follows the system by default, with the half-filled icon", async () => {
    mockSystemScheme = "dark";
    await renderControl();

    expect(await themeButton("Sistema")).toBeOnTheScreen();
    expect(
      screen.getByTestId("theme-icon-system", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.getByText("Hoja dark")).toBeOnTheScreen();
  });

  it("cycles Sistema → Claro → Oscuro → Sistema, saving each choice and switching the tokens", async () => {
    const settings = createFakeSettingsRepository();
    const store = createThemePreferenceStore("system");
    await renderControl({ settings, store });

    const steps: [ThemePreference, string, string][] = [
      ["light", "Claro", "Hoja light"],
      ["dark", "Oscuro", "Hoja dark"],
      ["system", "Sistema", "Hoja light"],
    ];
    let current = "Sistema";
    for (const [preference, name, sheet] of steps) {
      await fireEvent.press(await themeButton(current));
      expect(await themeButton(name)).toBeOnTheScreen();
      expect(
        screen.getByTestId(`theme-icon-${preference}`, { includeHiddenElements: true }),
      ).toBeOnTheScreen();
      expect(screen.getByText(sheet)).toBeOnTheScreen();
      expect(settings.themePreference()).toBe(preference);
      expect(store.get()).toBe(preference);
      current = name;
    }
  });

  it("confirms the new theme to screen readers after a press, not before", async () => {
    await renderControl();
    await themeButton("Sistema");
    expect(screen.queryByText(/^Tema: /)).toBeNull();

    await fireEvent.press(await themeButton("Sistema"));

    expect(screen.getByText("Tema: Claro")).toHaveProp("accessibilityLiveRegion", "polite");
  });

  it("applies the stored preference once it is read (the device's setting is the source)", async () => {
    const store = createThemePreferenceStore("light");
    await renderControl({
      settings: createFakeSettingsRepository({ themePreference: "dark" }),
      store,
    });

    expect(await themeButton("Oscuro")).toBeOnTheScreen();
    expect(
      screen.getByTestId("theme-icon-dark", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(store.get()).toBe("dark");
  });

  it("still shows the app when the stored preference cannot be read", async () => {
    const settings = createFakeSettingsRepository();
    settings.getThemePreference = () => Promise.reject(new Error("disk error"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await renderControl({ settings, store: createThemePreferenceStore("dark") });

    expect(await themeButton("Oscuro")).toBeOnTheScreen();
    expect(warn).toHaveBeenCalled();
  });
});

describe("ThemeToggleButton", () => {
  it.each([
    ["system", "Sistema"],
    ["light", "Claro"],
    ["dark", "Oscuro"],
  ] as const)("shows the %s icon and says what pressing it does", async (preference, name) => {
    const onCycle = jest.fn();
    await render(<ThemeToggleButton preference={preference} onCycle={onCycle} />);

    await fireEvent.press(screen.getByRole("button", { name: `Tema: ${name}. Cambiar tema` }));

    expect(
      screen.getByTestId(`theme-icon-${preference}`, { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(onCycle).toHaveBeenCalledTimes(1);
  });
});
