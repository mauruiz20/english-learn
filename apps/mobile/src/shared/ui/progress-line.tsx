import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { SETTLE_SPRING } from "./motion";
import type { HighlighterName } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";
import { themedStyles, useTheme } from "./use-theme";

type ProgressLineProps = {
  /** Completed amount, 0…max. */
  value: number;
  max: number;
  /** Accessible name, e.g. "Progreso de la lección". */
  label: string;
  /** Draw the done part with this highlighter (e.g. the lesson's topic) under the ink line. */
  tint?: HighlighterName | undefined;
};

/**
 * A thin ink line drawn over a ruled line: how far along something is. Tinted, the done part is
 * also swiped with a highlighter, the ink line still marking it on top. When the value changes
 * the line springs to its new length (instantly with reduced motion).
 */
export function ProgressLine({ value, max, label, tint }: ProgressLineProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  const reduced = useReducedMotion();
  const shown = useSharedValue(ratio);
  useEffect(() => {
    shown.set(reduced ? ratio : withSpring(ratio, SETTLE_SPRING));
  }, [ratio, reduced, shown]);
  const width = useAnimatedStyle(() => ({ width: `${shown.value * 100}%` }));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value }}
      style={[styles.track, tint !== undefined && styles.tintedTrack]}
    >
      {tint !== undefined && (
        <>
          <View style={styles.rule} />
          <Animated.View
            style={[styles.band, { backgroundColor: colors.highlighters[tint] }, width]}
          />
        </>
      )}
      <Animated.View style={[styles.fill, width]} />
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    track: {
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.rule,
      overflow: "hidden",
      justifyContent: "flex-end",
    },
    // Room for the highlighter band; the ruled line and the ink stay 3 pt at the bottom.
    tintedTrack: { height: 9, backgroundColor: "transparent" },
    rule: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 3,
      backgroundColor: colors.rule,
    },
    band: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 2 },
    fill: { height: 3, backgroundColor: colors.ink },
  }),
);
