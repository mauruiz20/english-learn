import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { MOTION } from "./motion";
import { Text } from "./text";
import { fonts } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";
import { useTheme } from "./use-theme";

const WIDTH = 176;
const HEIGHT = 60;

// A rubber stamp's frame, inked unevenly: a heavy outer line and a thin inner one, neither quite
// straight. Hand-tuned curves, not random, so the stamp is the same every time.
const OUTER =
  "M6 5 C 48 2, 118 7, 170 3 C 173 22, 171 40, 172 56 C 118 58, 58 54, 4 57 C 2 40, 5 22, 6 5 Z";
const INNER =
  "M12 11 C 56 9, 120 12, 164 9 C 166 24, 165 38, 166 50 C 118 52, 60 49, 10 51 C 9 38, 12 24, 12 11 Z";

/** How the stamp hits the page: from a bit above (larger, transparent) down onto the paper. */
const LAND = { damping: 11, stiffness: 320, mass: 0.6 } as const;

/**
 * The teacher's "¡Excelente!" stamp, pressed onto a page with every answer right: red-pen ink,
 * rotated, uneven edges. It lands with a small overshoot (≈ 300 ms); with reduced motion it is
 * simply there. Only for perfect results (the caller decides).
 */
export function PerfectStamp() {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const landed = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      landed.set(1);
      return;
    }
    landed.set(withSpring(1, LAND));
  }, [reduced, landed]);
  const ink = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    ink.set(reduced ? 1 : withTiming(1, { duration: MOTION.note }));
  }, [reduced, ink]);
  const style = useAnimatedStyle(() => ({
    opacity: ink.value,
    transform: [{ rotate: "-8deg" }, { scale: 1.6 - 0.6 * landed.value }],
  }));
  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Sello: ¡Excelente!"
      style={[styles.stamp, style]}
    >
      <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={styles.frame}>
        <Path
          d={OUTER}
          fill="none"
          stroke={colors.redPen}
          strokeWidth={3.5}
          strokeLinejoin="round"
        />
        <Path
          d={INNER}
          fill="none"
          stroke={colors.redPen}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      </Svg>
      <View style={styles.label}>
        <Text style={[styles.text, { color: colors.redPen }]}>¡EXCELENTE!</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stamp: { width: WIDTH, height: HEIGHT, opacity: 0.92 },
  frame: { position: "absolute", top: 0, left: 0 },
  label: { flex: 1, alignItems: "center", justifyContent: "center" },
  text: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 26, letterSpacing: 1.5 },
});
