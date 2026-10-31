import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { MOTION } from "./motion";
import { HIGHLIGHTER_NAMES } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";
import { useTheme } from "./use-theme";

const DOTS = 22;

/** A dot's spot and flight, the same every time (no randomness: screenshots stay stable). */
function dot(i: number) {
  // Golden-angle spread across the width, alternating sizes and delays.
  const x = ((i * 0.618034) % 1) * 100;
  return {
    left: `${x}%` as const,
    size: 7 + (i % 3) * 2.5,
    drift: ((i % 5) - 2) * 14,
    fall: 220 + (i % 4) * 60,
    delay: (i % 6) * 70,
    spin: (i % 2 === 0 ? 1 : -1) * (90 + i * 7),
  };
}

/**
 * "Papel picado" from a hole punch, in the highlighter colors, falling once over the top of the
 * page (≈ 1.4 s) to celebrate a finished lesson. Purely decorative: not rendered at all with
 * reduced motion, hidden from assistive technology and from touches.
 */
export function Confetti({ delayMs = 0 }: { delayMs?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <View
      testID="confetti"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.layer}
    >
      {Array.from({ length: DOTS }, (_, i) => (
        <Dot key={i} index={i} delayMs={delayMs} />
      ))}
    </View>
  );
}

function Dot({ index, delayMs }: { index: number; delayMs: number }) {
  const { colors } = useTheme();
  const d = dot(index);
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(
      withDelay(
        delayMs + d.delay,
        withTiming(1, { duration: MOTION.confetti - d.delay, easing: Easing.in(Easing.quad) }),
      ),
    );
  }, [t, delayMs, d.delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : 1 - Math.max(0, t.value - 0.7) / 0.3,
    transform: [
      { translateY: -20 + d.fall * t.value },
      { translateX: d.drift * t.value },
      { rotate: `${d.spin * t.value}deg` },
    ],
  }));
  const name = HIGHLIGHTER_NAMES[index % HIGHLIGHTER_NAMES.length] ?? "yellow";
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          left: d.left,
          width: d.size,
          height: d.size,
          borderRadius: d.size / 2,
          backgroundColor: colors.highlighters[name],
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 0, right: 0, top: 0, height: 320, overflow: "hidden" },
  dot: { position: "absolute", top: 0 },
});
