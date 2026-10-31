import { Easing } from "react-native-reanimated";

/**
 * Motion in the notebook explains what changed or rewards the learner; it never decorates. One
 * orchestrated moment per screen at most, short durations, and with reduced motion every
 * animation shows its end state at once (`useReducedMotion`).
 */
export const MOTION = {
  /** A pen or highlighter stroke across an answer, a check mark being drawn. */
  stroke: 250,
  /** The teacher's margin note appearing once the stroke is done. */
  note: 150,
  /** Press feedback (scale down on press-in, back on release). */
  press: 90,
  /** Turning to the next exercise. */
  page: 220,
  /** XP counting up on the summary. */
  count: 650,
  /** The streak number rolling to its new value. */
  roll: 300,
} as const;

/** How far a pressed button or row shrinks. */
export const PRESS_SCALE = 0.97;

/** A hand stroke: quick start, gentle finish. Shared by the highlighter, red pen and check. */
export const penEasing = Easing.out(Easing.cubic);

/** Physical things (paper strips, the stamp, the progress line) settle with a spring. */
export const SETTLE_SPRING = { damping: 20, stiffness: 280, mass: 0.7 } as const;
