import { act, render, screen } from "@testing-library/react-native";
import { Text } from "./text";
import { HIGHLIGHTER_NAMES, palettes, themeFor } from "./theme";
import { createThemePreferenceStore, type ThemePreference } from "./theme-preference";
import { ThemeOverride, ThemePreferenceStoreProvider, useTheme } from "./use-theme";

function SchemeProbe() {
  const { scheme, colors } = useTheme();
  return <Text>{`${scheme} ${colors.paper}`}</Text>;
}

let mockSystemScheme: "light" | "dark" | null = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockSystemScheme,
}));

afterEach(() => {
  mockSystemScheme = "light";
});

describe("themeFor", () => {
  it("uses the night notebook tokens for the dark scheme", () => {
    expect(themeFor("dark")).toEqual({ scheme: "dark", colors: palettes.dark });
    expect(palettes.dark.paper).toBe("#0F1A33");
  });

  it.each([["light"], [null], [undefined], ["unspecified"]])(
    "uses the daytime paper for %p",
    (scheme) => {
      expect(themeFor(scheme)).toEqual({ scheme: "light", colors: palettes.light });
    },
  );

  it("keeps the highlighter yellow, with dark text on it, in both schemes", () => {
    expect(palettes.dark.highlighter).toBe("#FFD23F");
    expect(palettes.dark.onHighlighter).toBe(palettes.light.onHighlighter);
  });
});

describe("useTheme", () => {
  it("follows the system color scheme", async () => {
    mockSystemScheme = "dark";

    await render(<SchemeProbe />);

    expect(screen.getByText("dark #0F1A33")).toBeOnTheScreen();
  });

  it("can be forced for a subtree (the sticky note is always light paper)", async () => {
    mockSystemScheme = "dark";

    await render(
      <ThemeOverride scheme="light">
        <SchemeProbe />
      </ThemeOverride>,
    );

    expect(screen.getByText("light #F5F7FF")).toBeOnTheScreen();
  });

  function renderWithPreference(preference: ThemePreference) {
    const store = createThemePreferenceStore(preference);
    const view = render(
      <ThemePreferenceStoreProvider store={store}>
        <SchemeProbe />
      </ThemePreferenceStoreProvider>,
    );
    return { store, view };
  }

  it.each([
    ["dark", "light", "dark #0F1A33"],
    ["light", "dark", "light #F5F7FF"],
    ["system", "dark", "dark #0F1A33"],
    ["system", "light", "light #F5F7FF"],
  ] as const)(
    "with the %s preference and a %s system, shows %s",
    async (preference, system, shown) => {
      mockSystemScheme = system;

      const { view } = renderWithPreference(preference);
      await view;

      expect(screen.getByText(shown)).toBeOnTheScreen();
    },
  );

  it("switches the tokens as soon as the preference changes", async () => {
    const { store, view } = renderWithPreference("system");
    await view;
    expect(screen.getByText("light #F5F7FF")).toBeOnTheScreen();

    await act(() => store.set("dark"));
    expect(screen.getByText("dark #0F1A33")).toBeOnTheScreen();

    await act(() => store.set("system"));
    expect(screen.getByText("light #F5F7FF")).toBeOnTheScreen();
  });

  it("keeps a forced subtree whatever the preference", async () => {
    await render(
      <ThemePreferenceStoreProvider store={createThemePreferenceStore("dark")}>
        <ThemeOverride scheme="light">
          <SchemeProbe />
        </ThemeOverride>
      </ThemePreferenceStoreProvider>,
    );

    expect(screen.getByText("light #F5F7FF")).toBeOnTheScreen();
  });
});

/** WCAG 2 relative luminance of a `#RRGGBB` color. */
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("text contrast (WCAG AA, 4.5:1)", () => {
  const textTokens = ["text", "textMuted", "ink", "success", "redPen"] as const;
  const cases = (["light", "dark"] as const).flatMap((scheme) =>
    (["paper", "sheet"] as const).flatMap((background) =>
      textTokens.map((token) => [scheme, token, background] as const),
    ),
  );

  it.each(cases)("%s %s on %s", (scheme, token, background) => {
    const colors = palettes[scheme];
    expect(contrast(colors[token], colors[background])).toBeGreaterThanOrEqual(4.5);
  });

  it("dark text on the highlighter", () => {
    expect(
      contrast(palettes.light.onHighlighter, palettes.light.highlighter),
    ).toBeGreaterThanOrEqual(4.5);
  });

  const highlighterCases = (["light", "dark"] as const).flatMap((scheme) =>
    HIGHLIGHTER_NAMES.map((name) => [scheme, name] as const),
  );

  it.each(highlighterCases)("%s: dark text on the %s highlighter", (scheme, name) => {
    const colors = palettes[scheme];
    expect(contrast(colors.onHighlighter, colors.highlighters[name])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("feedback bands", () => {
  const verdicts = ["correct", "almost", "wrong"] as const;
  const cases = (["light", "dark"] as const).flatMap((scheme) =>
    verdicts.map((verdict) => [scheme, verdict] as const),
  );

  it.each(cases)("%s %s: its ink and the body text read on its tint", (scheme, verdict) => {
    const colors = palettes[scheme];
    const band = colors.feedback[verdict];
    expect(contrast(band.ink, band.tint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.text, band.tint)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("buttons", () => {
  it.each(["light", "dark"] as const)(
    "%s: text on ink reads, and the ink edge is darker",
    (scheme) => {
      const colors = palettes[scheme];
      expect(contrast(colors.onInk, colors.ink)).toBeGreaterThanOrEqual(4.5);
      expect(luminance(colors.inkEdge)).toBeLessThan(luminance(colors.ink));
    },
  );
});

describe("highlighters", () => {
  it("has six distinct highlighters per scheme, yellow being the correct-answer one", () => {
    expect(HIGHLIGHTER_NAMES).toEqual(["yellow", "pink", "green", "orange", "sky", "lilac"]);
    for (const scheme of ["light", "dark"] as const) {
      const colors = palettes[scheme];
      expect(new Set(Object.values(colors.highlighters)).size).toBe(6);
      expect(colors.highlighters.yellow).toBe(colors.highlighter);
    }
  });

  it("keeps dark text on highlighter fills in the dark scheme too", () => {
    expect(palettes.dark.onHighlighter).toBe("#1B2333");
  });
});
