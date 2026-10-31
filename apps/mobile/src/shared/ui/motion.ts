import { Easing } from "react-native-reanimated";

/**
 * Motion in the notebook explains what changed or rewards the learner; it never decorates, and
 * nothing moves on its own while an exercise waits for an answer. One orchestrated moment per
 * screen at most, short durations (celebrations up to ≈ 1.4 s), only transforms and opacity, and
 * with reduced motion every animation shows its end state at once (`useReducedMotion`).
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
  /** A "+10" sticker popping off a right answer and floating away. */
  pop: 650,
  /** Avi gliding to the lesson to do next. */
  fly: 700,
  /** Paper dots falling over a finished lesson. */
  confetti: 1400,
} as const;

/** How far a pressed button or row shrinks. */
export const PRESS_SCALE = 0.97;

/** A hand stroke: quick start, gentle finish. Shared by the highlighter, red pen and check. */
export const penEasing = Easing.out(Easing.cubic);

/** Physical things (paper strips, the stamp, the progress line) settle with a spring. */
export const SETTLE_SPRING = { damping: 20, stiffness: 280, mass: 0.7 } as const;

/** A sticker slapped onto the page: lands from above with a small bounce. */
export const SLAP_SPRING = { damping: 12, stiffness: 260, mass: 0.7 } as const;
