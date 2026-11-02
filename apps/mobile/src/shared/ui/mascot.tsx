import { useEffect } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { MOTION } from "./motion";
import { useReducedMotion } from "./use-reduced-motion";
import { useTheme } from "./use-theme";

export type AviMood = "happy" | "cheer" | "sleepy";

type AviProps = {
  mood?: AviMood;
  /** Width in points (the plane is 4:3). */
  size?: number;
  /** Glide in once, from the side it faces, after `delayMs` (e.g. to the lesson to do next). */
  fly?: boolean;
  /** Final rotation in degrees (positive turns the nose down). The art itself points ≈ 17° up. */
  tilt?: number;
  /** Which way the nose points; "left" mirrors the plane. */
  facing?: "right" | "left";
  delayMs?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

// A folded paper plane seen from the side: the body, the fold line down to the keel.
const BODY = "M3 23 L61 5 L41 43 L31 28 Z";
const FOLD = "M61 5 L31 28 L27 39 L31 28";

/**
 * Avi, the notebook's paper plane: the learner's companion on the home path, on the summary and
 * in empty states; never during an exercise. Original art drawn here. Decorative.
 */
export function Avi({
  mood = "happy",
  size = 64,
  fly = false,
  tilt = -14,
  facing = "right",
  delayMs = 0,
  style,
  testID = "avi",
}: AviProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const animate = fly && !reduced;
  const t = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) {
      t.set(1);
      return;
    }
    t.set(
      withDelay(delayMs, withTiming(1, { duration: MOTION.fly, easing: Easing.out(Easing.cubic) })),
    );
  }, [animate, delayMs, t]);
  const glide = useAnimatedStyle(() => {
    const left = 1 - t.value;
    const away = facing === "left" ? 1 : -1;
    return {
      opacity: Math.min(1, t.value * 3),
      transform: [
        // Comes from behind its tail: the left when facing right, the right when mirrored.
        { translateX: away * size * 2.2 * left },
        // An arc: up, then down onto its spot.
        { translateY: -size * 0.9 * Math.sin(left * Math.PI) },
        // Mirrored before turning, so a positive tilt still points the nose down.
        ...(facing === "left" ? [{ scaleX: -1 }] : []),
        { rotate: `${tilt + 20 * left}deg` },
      ],
    };
  });
  // The plane is white paper in both schemes, so its face is always dark ink.
  const eye = "#1B2333";
  return (
    <Animated.View
      testID={testID}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[{ width: size, height: (size * 3) / 4 }, style, glide]}
    >
      <Svg width={size} height={(size * 3) / 4} viewBox="0 0 64 48">
        <Path
          d={BODY}
          fill="#FFFFFF"
          stroke={colors.ink}
          strokeWidth={2.6}
          strokeLinejoin="round"
        />
        <Path d={FOLD} fill="none" stroke={colors.ink} strokeWidth={2.6} strokeLinejoin="round" />
        {mood === "sleepy" ? (
          <>
            <Path
              d="M40 19 q3 2 6 0"
              fill="none"
              stroke={eye}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            <Path
              d="M47.5 16 q3 2 6 0"
              fill="none"
              stroke={eye}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <Circle cx={43} cy={19} r={2.6} fill={eye} />
            <Circle cx={50} cy={16} r={2.6} fill={eye} />
          </>
        )}
        {mood === "cheer" ? (
          <Path
            d="M43 23.5 q4 5 8.5 -1.5 z"
            fill={eye}
            stroke={eye}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        ) : (
          <Path
            d="M44 24 q3 2.5 6 -1"
            fill="none"
            stroke={eye}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        )}
        <Circle cx={40} cy={25} r={2} fill={colors.highlighters.pink} />
      </Svg>
    </Animated.View>
  );
}
