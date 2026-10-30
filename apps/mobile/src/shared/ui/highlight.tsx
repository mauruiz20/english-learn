import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View, type TextProps } from "react-native";
import { Text, type TextVariant } from "./text";
import type { HighlighterName } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";
import { useTheme } from "./use-theme";

type HighlightProps = Omit<TextProps, "children"> & {
  children: string;
  /** What the visible text renders instead of `children` (e.g. with lookup targets); same text. */
  content?: ReactNode;
  variant?: TextVariant;
  /** Swipe the highlighter left to right once (≈ 250 ms) instead of showing it at once. */
  animate?: boolean;
  /**
   * lines: follows the text line by line (sentences that may wrap). swipe: one broad stroke
   * behind a single line (big numbers).
   */
  shape?: "lines" | "swipe";
  /** Which highlighter; yellow (the default) is reserved for "correct" and the streak. */
  color?: HighlighterName;
};

const SWIPE_MS = 250;
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
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [progress] = useState(() => new Animated.Value(animate ? 0 : 1));

  useEffect(() => {
    if (!animate || reducedMotion === null || width === 0) return;
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: SWIPE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [animate, reducedMotion, width, progress]);

  const textVariant = variant ?? "body";
  // A pixel of slack so the copy never wraps earlier than the text it marks.
  const markerWidth = width + 2;
  return (
    <View
      style={[styles.wrap, shape === "swipe" && styles.swipeWrap]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Animated.View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[
            styles.marker,
            shape === "swipe" && styles.swipeMarker,
            {
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, shape === "swipe" ? width + SWIPE_OVERHANG * 2 : markerWidth],
              }),
            },
          ]}
        >
          {shape === "swipe" ? (
            <View style={[styles.swipe, { backgroundColor: fill }]} />
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
        </Animated.View>
      )}
      <Text variant={textVariant} {...props} style={[style, { color: colors.onHighlighter }]}>
        {content ?? children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-start", maxWidth: "100%" },
  marker: { position: "absolute", top: 0, bottom: 0, left: 0, overflow: "hidden" },
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
