import { render, screen } from "@testing-library/react-native";
import { Text } from "./text";
import { palettes, themeFor } from "./theme";
import { ThemeOverride, useTheme } from "./use-theme";

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
    expect(palettes.dark.highlighter).toBe("#FFE135");
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

    expect(screen.getByText("light #F7F9FC")).toBeOnTheScreen();
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
});
