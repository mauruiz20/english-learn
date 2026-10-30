import type { Level } from "../cefr";

export type PlacementCandidate = {
  readonly id: string;
  readonly level: Level;
  /** Number of answer options; sets the guessing floor c = 1 / optionCount. */
  readonly optionCount: number;
  /** Item difficulty b on the theta scale. Defaults from the CEFR level when omitted. */
  readonly difficulty?: number;
};

export type PlacementAnswer = {
  readonly id: string;
  readonly correct: boolean;
};

/**
 * CEFR-derived prior difficulties. These are NOT calibrated item parameters; they will be
 * replaced by estimates fitted on real response data once the phase-2 backend exists.
 */
export const DEFAULT_DIFFICULTY: Readonly<Record<Level, number>> = {
  A1: -2,
  A2: -1,
  B1: 0,
  B2: 1,
  C1: 2,
};

export function difficultyOf(candidate: PlacementCandidate): number {
  return candidate.difficulty ?? DEFAULT_DIFFICULTY[candidate.level];
}

export function guessingOf(candidate: PlacementCandidate): number {
  const { optionCount } = candidate;
  if (!Number.isInteger(optionCount) || optionCount < 2) {
    throw new RangeError(
      `optionCount must be an integer ≥ 2, got ${optionCount} (${candidate.id})`,
    );
  }
  return 1 / optionCount;
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

/** 3PL with discrimination fixed at 1: P = c + (1 − c) / (1 + e^{−(θ − b)}). */
export function probabilityCorrect(theta: number, difficulty: number, guessing: number): number {
  return guessing + (1 - guessing) * logistic(theta - difficulty);
}

/** 3PL Fisher information (a = 1): I(θ) = (Q / P) · ((P − c) / (1 − c))². */
export function fisherInformation(theta: number, difficulty: number, guessing: number): number {
  const p = probabilityCorrect(theta, difficulty, guessing);
  if (p <= 0 || p >= 1) return 0;
  const ratio = (p - guessing) / (1 - guessing);
  return ((1 - p) / p) * ratio * ratio;
}

/** Cutoffs between adjacent levels; a theta exactly on a cutoff belongs to the upper level. */
const CUTOFFS: ReadonlyArray<readonly [number, Level]> = [
  [-1.5, "A1"],
  [-0.5, "A2"],
  [0.5, "B1"],
  [1.5, "B2"],
];

export function levelFromTheta(theta: number): Level {
  for (const [cutoff, level] of CUTOFFS) if (theta < cutoff) return level;
  return "C1";
}
