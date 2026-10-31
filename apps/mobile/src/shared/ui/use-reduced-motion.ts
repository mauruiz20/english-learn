import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useReducedMotion as useReducedMotionAtStart } from "react-native-reanimated";

/**
 * Whether the system asks for reduced motion (iOS/Android setting, `prefers-reduced-motion` on
 * web). Known on the first render (Reanimated reads the setting synchronously when the app
 * starts), then kept up to date if the learner changes it while the app is open. With it on,
 * every animation shows its end state at once.
 */
export function useReducedMotion(): boolean {
  const atStart = useReducedMotionAtStart();
  const [reduced, setReduced] = useState(atStart);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => active && setReduced(value),
      () => {},
    );
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
