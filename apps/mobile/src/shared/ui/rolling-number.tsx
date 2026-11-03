import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import { MOTION, SETTLE_SPRING } from "./motion";
import { Text, type TextVariant } from "./text";
import { typeScale } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";

type RollingNumberProps = {
  from: number;
  to: number;
  /** When the roll starts (e.g. timed with a sound). */
  delayMs: number;
  variant?: Extract<TextVariant, "title">;
  /** How each value reads ("2 días"); each line of the drum is formatted on its own. */
  format?: (value: number) => string;
};

const LINE = typeScale.title.lineHeight;

/**
 * A number that rolls up to its new value like an odometer drum (the old one leaves upward, the
 * new one comes in from below and settles with a spring). Decorative: the caller gives screen
 * readers the final value. With reduced motion it shows `to` at once.
 */
export function RollingNumber({
  from,
  to,
  delayMs,
  variant = "title",
  format = String,
}: RollingNumberProps) {
  const reduced = useReducedMotion();
  const [settled, setSettled] = useState(reduced);
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    progress.set(withDelay(delayMs, withSpring(1, SETTLE_SPRING)));
    // Once the drum has turned, only the new number stays.
    const timer = setTimeout(() => setSettled(true), delayMs + MOTION.roll);
    return () => clearTimeout(timer);
  }, [reduced, delayMs, progress]);
  const drum = useAnimatedStyle(() => ({ transform: [{ translateY: -LINE * progress.value }] }));

  if (settled || reduced) return <Text variant={variant}>{format(to)}</Text>;
  return (
    <View style={styles.window}>
      <Animated.View style={drum}>
        <Text variant={variant}>{format(from)}</Text>
        <Text variant={variant}>{format(to)}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  window: { height: LINE, overflow: "hidden" },
});
