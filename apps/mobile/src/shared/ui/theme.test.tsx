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
