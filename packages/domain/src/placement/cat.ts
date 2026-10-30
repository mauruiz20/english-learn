import type { Rng } from "../shuffle";
import {
  difficultyOf,
  fisherInformation,
  guessingOf,
  probabilityCorrect,
  type PlacementAnswer,
  type PlacementCandidate,
} from "./model";

export type AbilityEstimate = {
  /** Posterior mean of theta (EAP). */
  readonly theta: number;
  /** Posterior standard deviation, used as the standard error. */
  readonly se: number;
};

export const THETA_MIN = -4;
export const THETA_MAX = 4;
export const THETA_STEP = 0.05;
export const TIE_EPSILON = 1e-6;

// Built from integer steps to avoid accumulating floating-point drift.
const GRID: readonly number[] = Array.from(
  { length: Math.round((THETA_MAX - THETA_MIN) / THETA_STEP) + 1 },
  (_, i) => THETA_MIN + i * THETA_STEP,
);

type BankInput = {
  readonly candidates: readonly PlacementCandidate[];
  readonly answers: readonly PlacementAnswer[];
};

/**
 * Expected-a-posteriori ability estimate over a θ grid [−4, 4] (step 0.05) with a N(0, 1)
 * prior. Likelihoods are accumulated in log space and normalized with the max-log trick.
 */
export function estimateAbility({ candidates, answers }: BankInput): AbilityEstimate {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const items = answers.map((answer) => {
    const candidate = byId.get(answer.id);
    if (!candidate) throw new Error(`Answer for unknown placement item "${answer.id}"`);
    return { b: difficultyOf(candidate), c: guessingOf(candidate), correct: answer.correct };
  });

  const logPosterior = GRID.map((theta) => {
    let log = (-theta * theta) / 2;
    for (const { b, c, correct } of items) {
      const p = probabilityCorrect(theta, b, c);
      log += Math.log(correct ? p : 1 - p);
    }
    return log;
  });

  const maxLog = Math.max(...logPosterior);
  const weights = logPosterior.map((log) => Math.exp(log - maxLog));
  const total = weights.reduce((sum, w) => sum + w, 0);

  let mean = 0;
  GRID.forEach((theta, i) => (mean += theta * (weights[i] ?? 0)));
  mean /= total;

  let variance = 0;
  GRID.forEach((theta, i) => (variance += (theta - mean) ** 2 * (weights[i] ?? 0)));
  variance /= total;

  return { theta: mean, se: Math.sqrt(variance) };
}

function unused({ candidates, answers }: BankInput): PlacementCandidate[] {
  const answered = new Set(answers.map((a) => a.id));
  return candidates.filter((c) => !answered.has(c.id));
}

export function isBankExhausted(input: BankInput): boolean {
  return unused(input).length === 0;
}

/**
 * Maximum-information item selection: the unused candidate with the highest 3PL Fisher
 * information at the current EAP estimate. Candidates within TIE_EPSILON of the best are
 * tied and one is picked with the injected rng. Returns null when no candidate is left.
 */
export function nextQuestion({
  candidates,
  answers,
  rng,
}: BankInput & { readonly rng: Rng }): PlacementCandidate | null {
  const available = unused({ candidates, answers });
  if (available.length === 0) return null;

  const { theta } = estimateAbility({ candidates, answers });
  const scored = available.map((candidate) => ({
    candidate,
    info: fisherInformation(theta, difficultyOf(candidate), guessingOf(candidate)),
  }));
  const best = Math.max(...scored.map((s) => s.info));
  const tied = scored.filter((s) => best - s.info <= TIE_EPSILON);
  const pick = Math.min(tied.length - 1, Math.floor(rng() * tied.length));
  return tied[pick]?.candidate ?? null;
}

export type StopRule = {
  readonly answers: readonly PlacementAnswer[];
  readonly se: number;
  readonly minQuestions?: number;
  readonly maxQuestions?: number;
  readonly targetSe?: number;
};

/**
 * Stops at `maxQuestions`, or once `minQuestions` were answered and se < targetSe.
 * Bank exhaustion is a separate check (`isBankExhausted`).
 */
export function shouldStop({
  answers,
  se,
  minQuestions = 15,
  maxQuestions = 20,
  targetSe = 0.4,
}: StopRule): boolean {
  const count = answers.length;
  return count >= maxQuestions || (count >= minQuestions && se < targetSe);
}
