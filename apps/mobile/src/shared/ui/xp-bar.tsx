import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { XP_PER_SHEET, xpSheet } from "./model/xp-sheet";
import { MOTION, penEasing } from "./motion";
import { Text } from "./text";
import { radius, spacing } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";
import { themedStyles, useTheme } from "./use-theme";

/**
 * The learner's XP as sheets of stickers: every 250 XP fills a sheet. The bar is a highlighter
 * stroke across the current sheet; with `fillFrom` it fills from that XP up to `xp` once (a
 * session just earned it).
 */
export function XpBar({ xp, fillFrom }: { xp: number; fillFrom?: number | undefined }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const { sheet, filled, remaining, fraction } = xpSheet(xp);
  const start =
    fillFrom === undefined || reduced || xpSheet(fillFrom).sheet !== sheet
      ? fraction
      : xpSheet(fillFrom).fraction;
  const width = useSharedValue(start);
  useEffect(() => {
    width.set(
      start === fraction
        ? fraction
        : withDelay(300, withTiming(fraction, { duration: MOTION.count, easing: penEasing })),
    );
  }, [start, fraction, width]);
  const fill = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  const label = `Hoja ${sheet} de stickers`;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text variant="smallStrong">{label}</Text>
        <Text variant="title" tone="ink">{`${Math.max(0, Math.floor(xp))} XP`}</Text>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: XP_PER_SHEET, now: filled }}
        style={styles.track}
      >
        <Animated.View
          style={[styles.fill, { backgroundColor: colors.highlighters.yellow }, fill]}
        />
      </View>
      <Text variant="small" tone="muted">{`${remaining} XP para la próxima hoja`}</Text>
    </View>
  );
}

const useStyles = themedStyles(({ colors, scheme }) =>
  StyleSheet.create({
    wrap: { gap: spacing.xs },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    track: {
      height: 14,
      borderRadius: radius.pill,
      backgroundColor: scheme === "dark" ? colors.rule : "#E7ECF8",
      overflow: "hidden",
    },
    fill: {
      height: "100%",
      borderRadius: radius.pill,
      boxShadow: "inset 0 -3px 0 rgba(0, 0, 0, 0.1)",
    },
  }),
);
