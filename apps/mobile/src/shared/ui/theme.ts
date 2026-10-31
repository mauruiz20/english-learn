// "El cuaderno de stickers": the English notebook, ruled paper, blue ballpoint ink and the teacher's
// red pen, where the highlighters are also sticker paper: lessons become stickers to win and
// stick on the page. Light is daytime paper; dark is "cuaderno nocturno" (deep ink paper, chalk
// text).

export type ColorScheme = "light" | "dark";

/**
 * The highlighter set, also the sticker colors. Yellow is the "correct" signal (answers, streak,
 * the lesson to do next) and is never used for anything else; the others mark meaning: topics,
 * levels, the review sticky note.
 */
export const HIGHLIGHTER_NAMES = ["yellow", "pink", "green", "orange", "sky", "lilac"] as const;

export type HighlighterName = (typeof HIGHLIGHTER_NAMES)[number];

export type FeedbackBand = { readonly tint: string; readonly ink: string };

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
  /** Text on any highlighter (always dark: ≥ 4.5:1 on every fill, in both schemes). */
  readonly onHighlighter: string;
  /** Every highlighter; `yellow` equals `highlighter`. */
  readonly highlighters: Readonly<Record<HighlighterName, string>>;
  /** Errors and the teacher's corrections. */
  readonly redPen: string;
  /** The darker lip under an ink button (it reads as a key that can be pressed). */
  readonly inkEdge: string;
  /** The white die-cut border around a sticker. */
  readonly stickerEdge: string;
  /**
   * The band under an answer once it is checked: `tint` behind it, `ink` for its headline
   * (≥ 4.5:1 on the tint, like body text).
   */
  readonly feedback: Readonly<Record<"correct" | "almost" | "wrong", FeedbackBand>>;
  readonly success: string;
  /** Dialog backdrop. */
  readonly scrim: string;
};

const HIGHLIGHTER = "#FFD23F";

// Saturated sticker colors (sun, bubblegum, mint, coral, sky, grape). The night notebook uses
// them a touch darker, so they do not glow on deep ink paper; yellow stays the same.
const HIGHLIGHTERS: Readonly<Record<ColorScheme, Readonly<Record<HighlighterName, string>>>> = {
  light: {
    yellow: HIGHLIGHTER,
    pink: "#FF8FC7",
    green: "#3DDC97",
    orange: "#FF7A59",
    sky: "#5CC8FF",
    lilac: "#A78BFA",
  },
  dark: {
    yellow: HIGHLIGHTER,
    pink: "#EB83B7",
    green: "#38CA8B",
    orange: "#EB7052",
    sky: "#55B8EB",
    lilac: "#9A80E6",
  },
};

export const palettes: Readonly<Record<ColorScheme, Palette>> = {
  light: {
    paper: "#F5F7FF",
    sheet: "#FFFFFF",
    rule: "#DCE4F7",
    ink: "#2142C9",
    onInk: "#FFFFFF",
    text: "#1B2333",
    textMuted: "#4A5873",
    highlighter: HIGHLIGHTER,
    onHighlighter: "#1B2333",
    highlighters: HIGHLIGHTERS.light,
    redPen: "#D6293E",
    success: "#1A7A50",
    inkEdge: "#16308F",
    stickerEdge: "#FFFFFF",
    feedback: {
      correct: { tint: "#DDF6E9", ink: "#146B45" },
      almost: { tint: "#FFF3C4", ink: "#7A4F00" },
      wrong: { tint: "#FFE9E6", ink: "#B42335" },
    },
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
    highlighters: HIGHLIGHTERS.dark,
    redPen: "#FF7A8A",
    success: "#4FD39C",
    inkEdge: "#6F89D6",
    stickerEdge: "#E9EDF5",
    feedback: {
      correct: { tint: "#12352F", ink: "#4FD39C" },
      almost: { tint: "#3A3317", ink: "#FFD23F" },
      wrong: { tint: "#3A1B2A", ink: "#FF7A8A" },
    },
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

export const radius = { sm: 4, md: 10, lg: 16, pill: 999 } as const;

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
