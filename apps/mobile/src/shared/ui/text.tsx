import { Text as NativeText, type TextProps as NativeTextProps } from "react-native";
import { fonts, typeScale, type Palette } from "./theme";
import { useTheme } from "./use-theme";

export type TextVariant =
  "hero" | "display" | "heading" | "title" | "body" | "bodyStrong" | "small" | "smallStrong";

export type TextTone = "text" | "muted" | "ink" | "redPen" | "success" | "onInk";

const VARIANTS = {
  hero: { fontFamily: fonts.heading, ...typeScale.hero },
  display: { fontFamily: fonts.heading, ...typeScale.display },
  heading: { fontFamily: fonts.heading, ...typeScale.heading },
  title: { fontFamily: fonts.headingMedium, ...typeScale.title },
  body: { fontFamily: fonts.body, ...typeScale.body },
  bodyStrong: { fontFamily: fonts.bodyBold, ...typeScale.body },
  small: { fontFamily: fonts.body, ...typeScale.small },
  smallStrong: { fontFamily: fonts.bodyBold, ...typeScale.small },
} as const satisfies Record<TextVariant, object>;

const TONES: Readonly<Record<TextTone, Exclude<keyof Palette, "highlighters" | "feedback">>> = {
  text: "text",
  muted: "textMuted",
  ink: "ink",
  redPen: "redPen",
  success: "success",
  onInk: "onInk",
};

export type TextProps = NativeTextProps & { variant?: TextVariant; tone?: TextTone };

/** Themed text: Bricolage Grotesque for headings and numbers, Atkinson Hyperlegible otherwise. */
export function Text({ variant = "body", tone, style, ...props }: TextProps) {
  const { colors } = useTheme();
  const defaultTone: TextTone =
    variant === "hero" || variant === "display" || variant === "heading" ? "ink" : "text";
  return (
    <NativeText
      {...props}
      style={[VARIANTS[variant], { color: colors[TONES[tone ?? defaultTone]] }, style]}
    />
  );
}
