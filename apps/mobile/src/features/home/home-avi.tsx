import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { Avi } from "@/shared/ui/mascot";
import { SLAP_SPRING } from "@/shared/ui/motion";
import { WIDE_BREAKPOINT } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { radius, spacing } from "@/shared/ui/theme";
import { useAppVisible } from "@/shared/ui/use-app-visible";
import { useReducedMotion } from "@/shared/ui/use-reduced-motion";
import { themedStyles, useTheme } from "@/shared/ui/use-theme";
import type { HomeAviState } from "./model/home-avi";

/**
 * Durations of Avi's home moments (`docs/design/avi-rewards.md`, section 5.2, and "Slice 3 as
 * built"), in ms. Each plays once when Avi enters a state; with reduced motion none plays and
 * Avi shows the final pose at once.
 */
export const HOME_AVI_MOTION = {
  /** Welcome back: the tilt wiggles ±6° twice. */
  wave: 600,
  /** Celebrate a lesson: rises 10 pt and lands with `SLAP_SPRING` (≈ 500 ms in all). */
  hopUp: 180,
  /** Celebrate a badge: one 360° roll along an arc. */
  loop: 900,
  /** Missed you: tilts 12° nose down, 4 pt lower, and stays. */
  droop: 400,
  /** Leaving "missed you": back to the default pose. */
  perkUp: 250,
  /** The idle hover: half a bob, up or down (a whole bob is twice this). */
  bob: 1400,
  /** How long the eyes stay shut in a blink. */
  blink: 150,
} as const;

/** A blink every this many ms while Avi is on screen. */
export const BLINK_EVERY_MS = 4000;

const DROOP = { tilt: 12, drop: 4 } as const;
/** How far the idle hover lifts Avi, in pt. */
const BOB_HEIGHT = 2.5;

/** Avi's width beside the greeting: compact on phones, larger on wide screens. */
function heroSize(width: number): number {
  return width >= WIDE_BREAKPOINT ? 96 : 76;
}

type HomeAviProps = {
  state: HomeAviState;
  /** Home is the focused screen: ambient motion (bob, blink) pauses while it is not. */
  active: boolean;
  /** What sits above the bubble, beside Avi (the greeting). */
  children?: ReactNode;
};

/**
 * Avi beside the home greeting, with a line in a speech bubble. Decorative: Avi is hidden from
 * screen readers and the bubble carries the state. It plays its state's moment once, hovers
 * gently and blinks while home is on screen and visible, and keeps still with reduced motion.
 */
export function HomeAvi({ state, active, children }: HomeAviProps) {
  const styles = useStyles();
  const size = heroSize(useWindowDimensions().width);
  const reduced = useReducedMotion();
  const visible = useAppVisible();
  const ambient = !reduced && visible && active;
  const blink = useBlink(ambient && state.mood !== "sleepy");
  const pose = usePose(state, reduced, ambient);
  return (
    <View style={styles.row}>
      <View style={styles.words}>
        {children}
        {state.bubble !== null && <Bubble text={state.bubble} />}
      </View>
      <View testID="home-avi" style={[styles.avi, { minWidth: size, minHeight: size }]}>
        <Animated.View testID="home-avi-pose" style={pose}>
          <Avi testID="avi-hero" mood={state.mood} size={size} tilt={-8} blink={blink} />
        </Animated.View>
      </View>
    </View>
  );
}

/** Avi's line, in a speech bubble pointing at it. Said once by screen readers when it changes. */
function Bubble({ text }: { text: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View testID="home-avi-bubble" style={styles.bubble}>
      <Text accessibilityLiveRegion="polite" variant="small" tone="text">
        {text}
      </Text>
      {/* The tail, towards Avi on the right (decorative). */}
      <Svg width={10} height={14} viewBox="0 0 10 14" style={styles.tail} aria-hidden>
        <Path d="M0 1 L9 7 L0 13" fill={colors.sheet} stroke={colors.ink} strokeWidth={1.5} />
      </Svg>
    </View>
  );
}

/** Eyes shut for a moment every few seconds, only while `on`; no timer at all while off. */
function useBlink(on: boolean): boolean {
  const [shut, setShut] = useState(false);
  useEffect(() => {
    if (!on) return;
    let open: ReturnType<typeof setTimeout> | undefined;
    const every = setInterval(() => {
      setShut(true);
      open = setTimeout(() => setShut(false), HOME_AVI_MOTION.blink);
    }, BLINK_EVERY_MS);
    return () => {
      clearInterval(every);
      if (open !== undefined) clearTimeout(open);
      // Paused mid-blink: the eyes open again.
      setShut(false);
    };
  }, [on]);
  return on && shut;
}

/** The pose's animated style: the state's moment, the droop, and the idle hover. */
function usePose(state: HomeAviState, reduced: boolean, ambient: boolean) {
  const drooping = state.moment === "droop";
  // With reduced motion the final pose shows from the first frame.
  const tilt = useSharedValue(drooping && reduced ? DROOP.tilt : 0);
  const lift = useSharedValue(drooping && reduced ? DROOP.drop : 0);
  const spin = useSharedValue(0);
  const bob = useSharedValue(0);
  const played = useRef<string | null>(null);

  useEffect(() => {
    const key = `${state.kind}:${state.moment ?? ""}`;
    if (played.current === key) return;
    played.current = key;
    [tilt, lift, spin].forEach((value) => cancelAnimation(value));
    spin.set(0);
    if (reduced) {
      tilt.set(drooping ? DROOP.tilt : 0);
      lift.set(drooping ? DROOP.drop : 0);
      return;
    }
    const ease = { easing: Easing.inOut(Easing.quad) };
    // Leaving the droop (or any pose) perks up first.
    tilt.set(withTiming(0, { duration: HOME_AVI_MOTION.perkUp }));
    lift.set(withTiming(0, { duration: HOME_AVI_MOTION.perkUp }));
    switch (state.moment) {
      case "droop":
        tilt.set(withTiming(DROOP.tilt, { duration: HOME_AVI_MOTION.droop, ...ease }));
        lift.set(withTiming(DROOP.drop, { duration: HOME_AVI_MOTION.droop, ...ease }));
        break;
      case "wave": {
        const step = HOME_AVI_MOTION.wave / 5;
        tilt.set(
          withSequence(
            ...[-6, 6, -6, 6, 0].map((deg) => withTiming(deg, { duration: step, ...ease })),
          ),
        );
        break;
      }
      case "hop":
        lift.set(
          withSequence(
            withTiming(-10, { duration: HOME_AVI_MOTION.hopUp, easing: Easing.out(Easing.quad) }),
            withSpring(0, SLAP_SPRING),
          ),
        );
        break;
      case "loop":
        spin.set(
          withSequence(
            withTiming(360, { duration: HOME_AVI_MOTION.loop, ...ease }),
            withTiming(0, { duration: 0 }),
          ),
        );
        lift.set(
          withSequence(
            withTiming(-12, {
              duration: HOME_AVI_MOTION.loop / 2,
              easing: Easing.out(Easing.quad),
            }),
            withTiming(0, { duration: HOME_AVI_MOTION.loop / 2, easing: Easing.in(Easing.quad) }),
          ),
        );
        break;
      case null:
        break;
    }
  }, [state.kind, state.moment, drooping, reduced, tilt, lift, spin]);

  // The idle hover runs only while home is on screen and visible: it stops (and costs nothing)
  // in a hidden tab, a backgrounded app or under another screen.
  useEffect(() => {
    if (!ambient) {
      cancelAnimation(bob);
      bob.set(0);
      return;
    }
    const ease = { duration: HOME_AVI_MOTION.bob, easing: Easing.inOut(Easing.sin) };
    bob.set(withRepeat(withSequence(withTiming(-BOB_HEIGHT, ease), withTiming(0, ease)), -1));
    return () => cancelAnimation(bob);
  }, [ambient, bob]);

  return useAnimatedStyle(() => ({
    transform: [
      { translateY: lift.value + bob.value },
      // Mirrored, so Avi faces its bubble and the page; mirrored before turning, so a positive
      // tilt still points the nose down.
      { scaleX: -1 },
      { rotate: `${tilt.value}deg` },
      { rotate: `${spin.value}deg` },
    ],
  }));
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    words: { flex: 1, gap: spacing.sm, minWidth: 0 },
    avi: { alignItems: "center", justifyContent: "center" },
    bubble: {
      // Next to Avi, whose nose points at it.
      alignSelf: "flex-end",
      maxWidth: "100%",
      marginRight: spacing.sm,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md - 4,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.ink,
      backgroundColor: colors.sheet,
    },
    // Overlaps the border so the bubble's outline opens into the tail.
    tail: { position: "absolute", right: -9, top: 8 },
  }),
);
