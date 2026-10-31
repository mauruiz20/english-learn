import { useEffect, type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SLAP_SPRING } from "./motion";
import type { HighlighterName } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";
import { useTheme } from "./use-theme";

export type StickerState = "done" | "current" | "pending";

type StickerProps = {
  color: HighlighterName;
  /** done: a won sticker; current: the one to win next (yellow edge lip); pending: a dashed slot. */
  state?: StickerState;
  size?: number;
  /** Degrees; won stickers are never stuck perfectly straight. */
  tilt?: number;
  /** Slap it onto the page once (just won): drops from above with a bounce, after `delayMs`. */
  slap?: boolean;
  delayMs?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: ReactNode;
};

/**
 * A round sticker with a white die-cut edge. Decorative: whoever places it says what it means
 * (e.g. the lesson button's label). With reduced motion it is simply there.
 */
export function Sticker({
  color,
  state = "done",
  size = 64,
  tilt = 0,
  slap = false,
  delayMs = 0,
  style,
  testID,
  children,
}: StickerProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const animate = slap && !reduced;
  const landed = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) {
      landed.set(1);
      return;
    }
    landed.set(withDelay(delayMs, withSpring(1, SLAP_SPRING)));
  }, [animate, delayMs, landed]);
  const shown = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    shown.set(animate ? withDelay(delayMs, withTiming(1, { duration: 120 })) : 1);
  }, [animate, delayMs, shown]);
  const pending = state === "pending";
  const motion = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { scale: 1.45 - 0.45 * landed.value },
      { rotate: `${tilt + (1 - landed.value) * 14}deg` },
    ],
  }));
  const edge = Math.max(3, Math.round(size / 16));
  return (
    <Animated.View
      testID={testID}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.sticker,
        { width: size, height: size, borderRadius: size / 2, borderWidth: edge },
        pending
          ? { borderStyle: "dashed", borderColor: colors.textMuted, backgroundColor: colors.sheet }
          : {
              backgroundColor: colors.highlighters[color],
              borderColor: colors.stickerEdge,
              boxShadow:
                state === "current"
                  ? `0 5px 0 ${colors.highlighters.yellow === colors.highlighters[color] ? "#B8961F" : colors.inkEdge}`
                  : "0 3px 0 rgba(15, 26, 51, 0.18)",
            },
        style,
        pending ? { transform: [{ scale: 1 }, { rotate: "0deg" }] } : motion,
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sticker: { alignItems: "center", justifyContent: "center" },
});
