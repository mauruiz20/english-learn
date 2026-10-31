import { useEffect, useState } from "react";
import { MOTION } from "./motion";
import { countUpValue } from "./model/count-up";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * A number counting up from 0 to `target` (eased, ≈ 650 ms) after `delayMs`, frame by frame.
 * With reduced motion it is `target` from the first render.
 */
export function useCountUp(target: number, delayMs = 0): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) return;
    let start: number | null = null;
    let frame = 0;
    const tick = (now: number) => {
      start ??= now;
      const elapsed = now - start - delayMs;
      setValue(countUpValue(target, elapsed, MOTION.count));
      if (elapsed < MOTION.count) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, delayMs, reduced]);
  return reduced ? target : value;
}
