import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { clipChain, type ClipTier } from "./model/clip-chain";
import { SLAP_SPRING } from "./motion";
import type { HighlighterName } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";
import { useTheme } from "./use-theme";

const CLIP = "M6 22 V8 a4 4 0 0 1 8 0 V20 a6 6 0 0 1 -12 0 V9";
const CLIP_W = 16;
const CLIP_H = 30;
/** Clips hook into each other: each starts this far into the previous one. */
const OVERLAP = 4;

/** Colors of the chain's clips, cycled; a longer streak earns brighter clips. */
const TIER_COLORS: Readonly<Record<Exclude<ClipTier, "none">, readonly HighlighterName[] | null>> =
  {
    paper: null,
    week: ["sky", "lilac"],
    month: ["green", "sky", "lilac"],
    hundred: ["yellow", "orange", "pink"],
  };

/**
 * The streak as a chain of paperclips, one per day (up to five), hooked into each other. With
 * `grow`, the last clip drops onto the chain once (the session extended the streak). Decorative:
 * the streak is said in words next to it.
 */
export function ClipChainMark({
  days,
  grow = false,
  delayMs = 0,
}: {
  days: number;
  grow?: boolean;
  delayMs?: number;
}) {
  const { colors } = useTheme();
  const { clips, tier } = clipChain(days);
  const palette = tier === "none" ? null : TIER_COLORS[tier];
  const colorOf = (i: number) =>
    palette === null ? colors.ink : colors.highlighters[palette[i % palette.length] ?? "sky"];
  const width = Math.max(1, clips) * (CLIP_W - OVERLAP) + OVERLAP;
  return (
    <View
      testID="clip-chain"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.chain, { width, height: CLIP_H }]}
    >
      {clips === 0 ? (
        <Svg width={CLIP_W} height={CLIP_H} viewBox={`0 0 ${CLIP_W} ${CLIP_H}`}>
          <Path
            d={CLIP}
            fill="none"
            stroke={colors.textMuted}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeDasharray="3 4"
          />
        </Svg>
      ) : (
        Array.from({ length: clips }, (_, i) => (
          <Clip
            key={i}
            color={colorOf(i)}
            left={i * (CLIP_W - OVERLAP)}
            drop={grow && i === clips - 1}
            delayMs={delayMs}
          />
        ))
      )}
    </View>
  );
}

function Clip({
  color,
  left,
  drop,
  delayMs,
}: {
  color: string;
  left: number;
  drop: boolean;
  delayMs: number;
}) {
  const reduced = useReducedMotion();
  const animate = drop && !reduced;
  const landed = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    landed.set(animate ? withDelay(delayMs, withSpring(1, SLAP_SPRING)) : 1);
  }, [animate, delayMs, landed]);
  const style = useAnimatedStyle(() => ({
    opacity: landed.value > 0 ? 1 : 0,
    transform: [
      { translateY: -18 * (1 - landed.value) },
      { rotate: `${(1 - landed.value) * 30}deg` },
    ],
  }));
  return (
    <Animated.View testID="clip" style={[styles.clip, { left }, style]}>
      <Svg width={CLIP_W} height={CLIP_H} viewBox={`0 0 ${CLIP_W} ${CLIP_H}`}>
        <Path d={CLIP} fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chain: { position: "relative" },
  clip: { position: "absolute", top: 0 },
});
