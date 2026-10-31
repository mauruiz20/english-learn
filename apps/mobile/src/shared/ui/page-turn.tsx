import { useState, type ReactNode } from "react";
import Animated, { Easing, FadeInRight } from "react-native-reanimated";
import { MOTION } from "./motion";
import { useReducedMotion } from "./use-reduced-motion";

// The next page slides in a little from the right while it fades in: a subtle page turn, not a
// slideshow. The previous page simply goes: animating it out kept two exercises on screen (and
// in the accessibility tree) at once and made the page jump.
const ENTER = FadeInRight.duration(MOTION.page).easing(Easing.out(Easing.cubic));

/**
 * Turns the page when `pageKey` changes (the next exercise): the new content comes in from the
 * right (≈ 220 ms). The first page of a session is simply there, and so is every page with
 * reduced motion.
 */
export function PageTurn({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [firstKey] = useState(pageKey);
  const turning = !reduced && pageKey !== firstKey;
  return (
    <Animated.View key={pageKey} {...(turning ? { entering: ENTER } : {})}>
      {children}
    </Animated.View>
  );
}
