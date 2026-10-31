import { useEffect } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import { MOTION, SLAP_SPRING } from "./motion";
import { Text } from "./text";
import { fonts } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";
import { useTheme } from "./use-theme";

/**
 * A small yellow sticker with the points a right answer earned ("+10"): it pops in with a
 * bounce, then floats up and fades (≈ 650 ms). Decorative (the answer is announced in words);
 * with reduced motion it simply stays.
 */
export function PopBadge({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced ? 1 : 0);
  const rise = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      scale.set(1);
      rise.set(0);
      return;
    }
    scale.set(withSpring(1, SLAP_SPRING));
    rise.set(withDelay(MOTION.pop * 0.45, withTiming(1, { duration: MOTION.pop * 0.55 })));
  }, [reduced, scale, rise]);
  const motion = useAnimatedStyle(() => ({
    opacity: 1 - rise.value,
    transform: [{ translateY: -28 * rise.value }, { scale: scale.value }, { rotate: "12deg" }],
  }));
  return (
    <Animated.View
      testID="pop-badge"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.badge,
        { backgroundColor: colors.highlighters.yellow, borderColor: colors.stickerEdge },
        style,
        motion,
      ]}
    >
      <Text style={[styles.label, { color: colors.onHighlighter }]}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 3px 0 rgba(15, 26, 51, 0.2)",
  },
  label: { fontFamily: fonts.heading, fontSize: 15, lineHeight: 18 },
});
