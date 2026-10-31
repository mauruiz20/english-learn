import { useEffect, type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { MOTION, penEasing } from "./motion";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * Progress (0 → 1) of one pen stroke drawn left to right, started on mount when `animate` (after
 * `delayMs`). Without `animate`, or with reduced motion, it is complete from the first frame. Once
 * drawn it never undraws: `animate` turning false later leaves the stroke where it is.
 */
export function usePenStroke(animate: boolean, delayMs = 0): SharedValue<number> {
  const reduced = useReducedMotion();
  const progress = useSharedValue(animate && !reduced ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      delayMs,
      withTiming(1, { duration: MOTION.stroke, easing: penEasing }),
    );
  }, [animate, reduced, delayMs, progress]);
  return progress;
}

/**
 * Reveals its children from the left edge as `progress` goes 0 → 1, over `width` points: how a
 * highlighter swipe, a red-pen strike or a check mark appears to be drawn. Decorative: hidden
 * from assistive technology and from touches.
 */
export function StrokeClip({
  progress,
  width,
  style,
  children,
}: {
  progress: SharedValue<number>;
  width: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const reveal = useAnimatedStyle(() => ({ width: progress.value * width }));
  return (
    <Animated.View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.clip, style, reveal]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { position: "absolute", top: 0, bottom: 0, left: 0, overflow: "hidden" },
});
