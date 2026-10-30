import type { Level } from "../cefr";
import type { Rng } from "../shuffle";
import {
  estimateAbility,
  isBankExhausted,
  nextQuestion,
  shouldStop,
  type AbilityEstimate,
} from "./cat";
import { levelFromTheta, type PlacementAnswer, type PlacementCandidate } from "./model";

export type StopOptions = {
  readonly minQuestions?: number;
  readonly maxQuestions?: number;
  readonly targetSe?: number;
};

/**
 * Immutable, serializable placement state. It holds data only; the rng is passed to
 * each transition, so the session can be persisted and resumed.
 */
export type PlacementSession = {
  readonly candidates: readonly PlacementCandidate[];
  readonly answers: readonly PlacementAnswer[];
  readonly estimate: AbilityEstimate;
  readonly current: PlacementCandidate | null;
  readonly stop: StopOptions;
};

export type PlacementOutcome = AbilityEstimate & {
  readonly level: Level;
  readonly answered: number;
  readonly done: boolean;
};

function advance(
  candidates: readonly PlacementCandidate[],
  answers: readonly PlacementAnswer[],
  stop: StopOptions,
  rng: Rng,
): PlacementSession {
  const estimate = estimateAbility({ candidates, answers });
  const finished =
    shouldStop({ answers, se: estimate.se, ...stop }) || isBankExhausted({ candidates, answers });
  const current = finished ? null : nextQuestion({ candidates, answers, rng });
  return { candidates, answers, estimate, current, stop };
}

export function createPlacementSession({
  candidates,
  rng,
  ...stop
}: StopOptions & {
  readonly candidates: readonly PlacementCandidate[];
  readonly rng: Rng;
}): PlacementSession {
  if (candidates.length === 0) throw new Error("Placement bank is empty");
  const ids = new Set(candidates.map((c) => c.id));
  if (ids.size !== candidates.length) throw new Error("Placement bank has duplicate ids");
  return advance(candidates, [], stop, rng);
}

export function currentQuestion(session: PlacementSession): PlacementCandidate | null {
  return session.current;
}

/** Records the answer to the current question and selects the next one (or finishes). */
export function answer(
  session: PlacementSession,
  id: string,
  correct: boolean,
  rng: Rng,
): PlacementSession {
  if (session.current === null) throw new Error("Placement session is already finished");
  if (session.current.id !== id) {
    throw new Error(`"${id}" is not the current question ("${session.current.id}")`);
  }
  return advance(session.candidates, [...session.answers, { id, correct }], session.stop, rng);
}

/** Current (or final, when `done`) placement outcome. */
export function result(session: PlacementSession): PlacementOutcome {
  const { theta, se } = session.estimate;
  return {
    theta,
    se,
    level: levelFromTheta(theta),
    answered: session.answers.length,
    done: session.current === null,
  };
}
