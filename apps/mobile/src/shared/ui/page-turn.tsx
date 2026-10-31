import { useState, type ReactNode } from "react";
import Animated, { Easing, FadeInRight, FadeOutLeft } from "react-native-reanimated";
import { MOTION } from "./motion";
import { useReducedMotion } from "./use-reduced-motion";

// The next page slides in a little from the right as the previous one leaves to the left: a
// subtle page turn, not a slideshow.
const ENTER = FadeInRight.duration(MOTION.page).easing(Easing.out(Easing.cubic));
const EXIT = FadeOutLeft.duration(MOTION.page * 0.6);

/**
 * Turns the page when `pageKey` changes (the next exercise): the old content slides out, the new
 * one in (≈ 220 ms). The first page of a session is simply there, and so is every page with
 * reduced motion.
 */
export function PageTurn({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [firstKey] = useState(pageKey);
  const turning = !reduced && pageKey !== firstKey;
  return (
    <Animated.View
      key={pageKey}
      {...(turning ? { entering: ENTER } : {})}
      {...(reduced ? {} : { exiting: EXIT })}
    >
      {children}
    </Animated.View>
  );
}
