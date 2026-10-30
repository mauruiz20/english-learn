// "El cuaderno de inglés": ruled paper, blue ballpoint ink, yellow highlighter and the teacher's
// red pen. Light is daytime paper; dark is "cuaderno nocturno" (deep ink paper, chalk text).

export type ColorScheme = "light" | "dark";

export type Palette = {
  /** App background: the page. */
  readonly paper: string;
  /** Raised paper (paper strips, inputs, dialogs). */
  readonly sheet: string;
  /** Ruled lines and hairlines. */
  readonly rule: string;
  /** Primary: headings, primary buttons, links, focus ring. */
  readonly ink: string;
  /** Text on an ink fill. */
  readonly onInk: string;
  /** Body text. */
  readonly text: string;
  /** Secondary text; ≥ 4.5:1 on `paper` and `sheet`. */
  readonly textMuted: string;
  /** Accent: correct highlight, streak mark, sticky note. Same in both schemes. */
  readonly highlighter: string;
  /** Text on the highlighter. */
  readonly onHighlighter: string;
  /** Errors and the teacher's corrections. */
  readonly redPen: string;
  readonly success: string;
  /** Dialog backdrop. */
  readonly scrim: string;
};

const HIGHLIGHTER = "#FFE135";

export const palettes: Readonly<Record<ColorScheme, Palette>> = {
  light: {
    paper: "#F7F9FC",
    sheet: "#FFFFFF",
    rule: "#DCE6F2",
    ink: "#1E3A8A",
    onInk: "#FFFFFF",
    text: "#1B2333",
    textMuted: "#4A5873",
    highlighter: HIGHLIGHTER,
    onHighlighter: "#1B2333",
    redPen: "#D6293E",
    success: "#1A7A50",
    scrim: "rgba(27, 35, 51, 0.45)",
  },
  dark: {
    paper: "#0F1A33",
    sheet: "#16244A",
    rule: "#2B3C63",
    ink: "#A8C0FF",
    onInk: "#0F1A33",
    text: "#E9EDF5",
    textMuted: "#A3B0C8",
    highlighter: HIGHLIGHTER,
    onHighlighter: "#1B2333",
    redPen: "#FF7A8A",
    success: "#4FD39C",
    scrim: "rgba(4, 9, 20, 0.7)",
  },
};

/** Font families registered by the root layout (`useFonts`). */
export const fonts = {
  /** Bricolage Grotesque: headings and big numbers. */
  heading: "BricolageGrotesque_700Bold",
  headingMedium: "BricolageGrotesque_600SemiBold",
  /** Atkinson Hyperlegible: all body and UI text. */
  body: "AtkinsonHyperlegible_400Regular",
  bodyBold: "AtkinsonHyperlegible_700Bold",
  /** Caveat: ONLY the teacher's handwritten notes. */
  hand: "Caveat_600SemiBold",
} as const;

/** Type scale (font size / line height). */
export const typeScale = {
  small: { fontSize: 15, lineHeight: 22 },
  body: { fontSize: 17, lineHeight: 25 },
  title: { fontSize: 20, lineHeight: 27 },
  heading: { fontSize: 26, lineHeight: 32 },
  display: { fontSize: 34, lineHeight: 40 },
  hero: { fontSize: 48, lineHeight: 54 },
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 4, md: 10 } as const;

/** Minimum touch target (pt). */
export const TOUCH_TARGET = 48;

/** Reading column width on wide screens. */
export const MAX_TEXT_WIDTH = 560;

/** Height of one ruled line: text written "on the lines" uses it as its line height. */
export const RULED_LINE_HEIGHT = 36;

export type Theme = {
  readonly scheme: ColorScheme;
  readonly colors: Palette;
};

/** The theme for a color scheme; anything but "dark" (e.g. unknown) is light. */
export function themeFor(scheme: string | null | undefined): Theme {
  const resolved: ColorScheme = scheme === "dark" ? "dark" : "light";
  return { scheme: resolved, colors: palettes[resolved] };
}
