import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether the system asks for reduced motion (iOS/Android setting, `prefers-reduced-motion` on
 * web). `null` until known: wait for it before starting an animation.
 */
export function useReducedMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => active && setReduced(value),
      () => active && setReduced(false),
    );
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
