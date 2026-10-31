import { useState, type ReactNode } from "react";
import { StyleSheet, View, type TextProps } from "react-native";
import { StrokeClip, usePenStroke } from "./pen-stroke";
import { Text, type TextVariant } from "./text";
import type { HighlighterName } from "./theme";
import { useTheme } from "./use-theme";

type HighlightProps = Omit<TextProps, "children"> & {
  children: string;
  /** What the visible text renders instead of `children` (e.g. with lookup targets); same text. */
  content?: ReactNode;
  variant?: TextVariant;
  /**
   * Swipe the highlighter left to right once (a pen stroke, ≈ 250 ms, the same hand as the red
   * pen's strike) instead of showing it at once.
   */
  animate?: boolean;
  /**
   * lines: follows the text line by line (sentences that may wrap). swipe: one broad stroke
   * behind a single line (big numbers).
   */
  shape?: "lines" | "swipe";
  /** Which highlighter; yellow (the default) is reserved for "correct" and the streak. */
  color?: HighlighterName;
};

const SWIPE_OVERHANG = 6;

/**
 * Text marked with a highlighter (yellow unless `color` says otherwise), line by line. The marker is a clipped copy of the
 * text with a highlighted background behind the real text, so it follows line wraps; it is
 * hidden from assistive technology. Respects reduced motion.
 */
export function Highlight({
  children,
  content,
  variant,
  animate = false,
  shape = "lines",
  color = "yellow",
  style,
  ...props
}: HighlightProps) {
  const { colors } = useTheme();
  const fill = colors.highlighters[color];
  const [width, setWidth] = useState(0);
  const progress = usePenStroke(animate);

  const textVariant = variant ?? "body";
  // A pixel of slack so the copy never wraps earlier than the text it marks.
  const markerWidth = width + 2;
  return (
    <View
      style={[styles.wrap, shape === "swipe" && styles.swipeWrap]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <StrokeClip
          progress={progress}
          width={shape === "swipe" ? width + SWIPE_OVERHANG * 2 : markerWidth}
          style={shape === "swipe" && styles.swipeMarker}
        >
          {shape === "swipe" ? (
            <View
              style={[styles.swipe, { width: width + SWIPE_OVERHANG * 2, backgroundColor: fill }]}
            />
          ) : (
            <Text
              variant={textVariant}
              style={[style, { width: markerWidth, color: "transparent" }]}
            >
              <Text
                variant={textVariant}
                style={[style, { backgroundColor: fill, color: "transparent" }]}
              >
                {children}
              </Text>
            </Text>
          )}
        </StrokeClip>
      )}
      <Text variant={textVariant} {...props} style={[style, { color: colors.onHighlighter }]}>
        {content ?? children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-start", maxWidth: "100%" },
  // The broad stroke sits on the lower part of the line, past both ends of the number.
  swipeMarker: { left: -SWIPE_OVERHANG, top: "16%", bottom: "8%" },
  // Slanted like a highlighter stroke, with uneven ends.
  swipe: {
    flex: 1,
    borderRadius: 2,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 6,
    transform: [{ skewX: "-8deg" }],
  },
  swipeWrap: { marginLeft: SWIPE_OVERHANG },
});
